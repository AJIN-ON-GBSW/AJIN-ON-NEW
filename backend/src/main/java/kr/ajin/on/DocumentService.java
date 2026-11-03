package kr.ajin.on;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.multipart.MultipartFile;

@Service
public class DocumentService {
    private static final Logger log = LoggerFactory.getLogger(DocumentService.class);
    public record Document(UUID id, String scope, String title, String filename, String contentType, long size, Instant createdAt, String category) {}
    public record Download(Document metadata, Resource resource) {}
    private final JdbcClient jdbc;
    private final Path root;
    private final TransactionTemplate cleanupTransaction;
    private final RowMapper<Document> rowMapper = (rs, _) -> new Document(rs.getObject("id", UUID.class), rs.getString("scope"), rs.getString("title"),
        rs.getString("filename"), rs.getString("content_type"), rs.getLong("size"), rs.getTimestamp("created_at").toInstant(), rs.getString("category"));

    DocumentService(JdbcClient jdbc, PlatformTransactionManager transactionManager, @Value("${app.storage-root}") String storageRoot) throws IOException {
        this.jdbc = jdbc;
        cleanupTransaction = new TransactionTemplate(transactionManager);
        cleanupTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        root = Path.of(storageRoot).toAbsolutePath().normalize();
        Files.createDirectories(root);
    }

    public List<Document> list(String scope, String query) {
        if (scope != null) validateScope(scope);
        String sql = "SELECT * FROM documents WHERE (:allScopes OR scope = :scope) AND (:allNames OR title ILIKE :q OR filename ILIKE :q OR category ILIKE :q) ORDER BY created_at DESC LIMIT 200";
        return jdbc.sql(sql).param("allScopes", scope == null).param("scope", scope == null ? "" : scope)
            .param("allNames", query == null || query.isBlank()).param("q", "%" + PageService.escapeLike(query == null ? "" : query.strip()) + "%")
            .query(rowMapper).list();
    }

    @Transactional(rollbackFor = IOException.class)
    public Document upload(MultipartFile file, String scope, String title, String category) throws IOException {
        validateScope(scope);
        if (file.isEmpty()) throw new ApiException(400, "EMPTY_FILE", "내용이 있는 파일을 선택해 주세요.");
        if (file.getSize() > 25L * 1024 * 1024) throw new ApiException(413, "FILE_TOO_LARGE", "파일은 25MB 이하로 업로드해 주세요.");
        String filename = safeFilename(file.getOriginalFilename());
        String safeTitle = title == null || title.isBlank() ? filename : title.strip();
        if (safeTitle.length() > 200) throw new ApiException(400, "INVALID_TITLE", "자료 제목은 200자 이하로 입력해 주세요.");
        String safeCategory = category == null ? "" : category.strip();
        if (safeCategory.length() > 100) throw new ApiException(400, "INVALID_CATEGORY", "자료 분류는 100자 이하로 입력해 주세요.");
        String contentType = safeContentType(file.getContentType());
        UUID id = UUID.randomUUID();
        Path target = root.resolve(id.toString());
        Path temporary = Files.createTempFile(root, ".upload-", ".tmp");
        boolean created = false;
        try {
            try (InputStream stream = file.getInputStream()) { Files.copy(stream, temporary, StandardCopyOption.REPLACE_EXISTING); }
            long actualSize = Files.size(temporary);
            if (actualSize == 0 || actualSize > 25L * 1024 * 1024) throw new ApiException(413, "FILE_TOO_LARGE", "파일은 25MB 이하로 업로드해 주세요.");
            String sha = sha256(temporary);
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
            created = true;
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) {
                        try { Files.deleteIfExists(target); }
                        catch (IOException exception) { log.error("Could not clean up rolled-back upload {}", id, exception); }
                    }
                }
            });
            jdbc.sql("INSERT INTO documents(id,scope,title,filename,content_type,size,sha256,category) VALUES (:id,:scope,:title,:filename,:type,:size,:sha,:category)")
                .param("id", id).param("scope", scope).param("title", safeTitle).param("filename", filename)
                .param("type", contentType).param("size", actualSize).param("sha", sha).param("category", safeCategory).update();
            return get(id);
        } catch (IOException | RuntimeException exception) {
            if (created) Files.deleteIfExists(target);
            throw exception;
        } finally { Files.deleteIfExists(temporary); }
    }

    public Document get(UUID id) {
        return jdbc.sql("SELECT * FROM documents WHERE id = :id").param("id", id).query(rowMapper).optional()
            .orElseThrow(() -> new ApiException(404, "DOCUMENT_NOT_FOUND", "자료를 찾을 수 없습니다."));
    }

    public Download download(UUID id) throws IOException {
        Document document = get(id);
        try {
            // Open now: on POSIX a concurrent deletion cannot invalidate an already-open download.
            return new Download(document, new InputStreamResource(Files.newInputStream(root.resolve(id.toString()))));
        } catch (NoSuchFileException exception) {
            throw new ApiException(404, "FILE_NOT_FOUND", "자료 파일을 찾을 수 없습니다.");
        }
    }

    @Transactional
    public void delete(UUID id) {
        jdbc.sql("SELECT * FROM documents WHERE id = :id FOR UPDATE").param("id", id).query(rowMapper).optional()
            .orElseThrow(() -> new ApiException(404, "DOCUMENT_NOT_FOUND", "자료를 찾을 수 없습니다."));
        // Persist cleanup work with the metadata deletion. Rollback keeps the original file,
        // and a process crash or storage failure can safely retry the committed deletion later.
        jdbc.sql("INSERT INTO file_deletion_queue(id) VALUES(:id) ON CONFLICT(id) DO NOTHING").param("id", id).update();
        jdbc.sql("DELETE FROM documents WHERE id = :id").param("id", id).update();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if (status == STATUS_COMMITTED) deleteQueuedFile(id);
            }
        });
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 10_000)
    public void retryPendingFileDeletions() {
        for (UUID id : jdbc.sql("SELECT id FROM file_deletion_queue ORDER BY enqueued_at LIMIT 100")
                .query((rs, _) -> rs.getObject("id", UUID.class)).list()) deleteQueuedFile(id);
    }

    private void deleteQueuedFile(UUID id) {
        try {
            cleanupTransaction.executeWithoutResult(_ -> {
                var queued = jdbc.sql("SELECT id FROM file_deletion_queue WHERE id = :id FOR UPDATE SKIP LOCKED")
                    .param("id", id).query((rs, _) -> rs.getObject("id", UUID.class)).optional();
                if (queued.isEmpty()) return;
                try { Files.deleteIfExists(root.resolve(id.toString())); }
                catch (IOException exception) { throw new UncheckedIOException(exception); }
                jdbc.sql("DELETE FROM file_deletion_queue WHERE id = :id").param("id", id).update();
            });
        } catch (RuntimeException exception) {
            log.error("Document file deletion will be retried: {}", id, exception);
        }
    }

    private void validateScope(String scope) {
        if (scope == null || !scope.matches("[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}"))
            throw new ApiException(400, "INVALID_SCOPE", "자료 위치가 올바르지 않습니다.");
    }

    private String safeFilename(String original) {
        String filename = original == null ? "document" : original.replace('\\', '/');
        filename = filename.substring(filename.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "").strip();
        if (filename.isEmpty() || filename.equals(".") || filename.equals("..")) filename = "document";
        return filename.length() > 200 ? filename.substring(0, 200) : filename;
    }

    private String safeContentType(String supplied) {
        if (supplied == null || supplied.length() > 150 || supplied.contains("\r") || supplied.contains("\n")) return MediaType.APPLICATION_OCTET_STREAM_VALUE;
        try { return MediaType.parseMediaType(supplied).toString(); }
        catch (IllegalArgumentException _) { return MediaType.APPLICATION_OCTET_STREAM_VALUE; }
    }

    private String sha256(Path path) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream stream = Files.newInputStream(path)) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = stream.read(buffer)) != -1) digest.update(buffer, 0, count);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
}
