package kr.ajin.on;

import static org.junit.jupiter.api.Assertions.*;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ApiIntegrationTest {
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18.6-alpine").withDatabaseName("ajin_on_test");
    private static final Path STORAGE;
    static {
        try { STORAGE = Files.createTempDirectory("ajin-on-api-test-"); }
        catch (Exception exception) { throw new ExceptionInInitializerError(exception); }
    }
    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        POSTGRES.start();
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("app.storage-root", STORAGE::toString);
    }
    @AfterAll
    static void cleanup() throws Exception {
        POSTGRES.stop();
        try (var paths = Files.walk(STORAGE)) {
            for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
        }
    }

    @LocalServerPort int port;
    @Autowired DocumentService documents;
    @Autowired JdbcClient jdbc;
    @Autowired PlatformTransactionManager transactionManager;
    private final HttpClient http = HttpClient.newHttpClient();
    private final JsonMapper json = JsonMapper.builder().build();
    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
    private HttpResponse<String> request(String method, String path, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(uri(path));
        if (body == null) builder.method(method, HttpRequest.BodyPublishers.noBody());
        else builder.header("Content-Type", "application/json").method(method, HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
    private JsonNode tree(HttpResponse<String> response) { return json.readTree(response.body()); }

    @Test void seedsEveryReferenceScreenAndExposesHealth() throws Exception {
        var health = request("GET", "/actuator/health", null);
        assertEquals(200, health.statusCode());
        assertEquals("UP", tree(health).get("status").asText());
        var response = request("GET", "/api/pages", null);
        assertEquals(8, tree(response).size());
        for (String page : PageService.PAGES.keySet()) {
            var state = request("GET", "/api/pages/" + page + "/state", null);
            assertEquals(200, state.statusCode());
            assertTrue(tree(state).get("state").has("admin"));
            assertTrue(tree(state).get("revision").asLong() >= 0);
        }
        var original = request("GET", "/api/pages/field-audit/reference", null);
        assertTrue(tree(original).get("CRIT").size() > 20);
    }

    @Test void assessmentWorkbookChangesAreAtomicAndRevisionChecked() throws Exception {
        String url = "/api/assessment/library";
        String key = "metrics/2026-1";
        var first = request("POST", url, List.of(Map.of("name", key, "data", Map.of("plants", Map.of("경산", Map.of("score", 0))))));
        assertEquals(200, first.statusCode());
        var rev = tree(first).get(key).asText();
        var conflict = request("POST", url, List.of(Map.of("name", "hist/test", "data", Map.of("k", "internal__[]")),
            Map.of("name", key, "revision", UUID.randomUUID(), "data", Map.of())));
        assertEquals(409, conflict.statusCode());
        assertFalse(request("GET", url, null).body().contains("hist/test"));
        assertTrue(request("GET", url, null).body().contains(rev));
        assertEquals(200, request("POST", url, List.of(Map.of("name", key, "revision", rev))).statusCode());
    }

    @Test void statePersistsWithOptimisticRevisionAndHistory() throws Exception {
        String path = "/api/pages/performance/state";
        long revision = tree(request("GET", path, null)).get("revision").asLong();
        var state = Map.of("admin", true, "data", Map.of("ajin_incoming_1", "persistent-test-123"));
        var saved = request("PUT", path, Map.of("state", state, "revision", revision));
        assertEquals(200, saved.statusCode());
        assertEquals(revision + 1, tree(saved).get("revision").asLong());
        assertEquals("persistent-test-123", tree(request("GET", path, null)).get("state").get("data").get("ajin_incoming_1").asText());
        var conflict = request("PUT", path, Map.of("state", Map.of("overwritten", true), "revision", revision));
        assertEquals(409, conflict.statusCode());
        assertEquals("REVISION_CONFLICT", tree(conflict).get("code").asText());
        assertEquals(revision + 1, tree(conflict).get("currentRevision").asLong());
        var history = tree(request("GET", "/api/pages/performance/history", null));
        assertEquals(revision + 1, history.get(0).get("revision").asLong());
        assertEquals(state.get("data"), json.convertValue(history.get(0).get("state").get("data"), Map.class));
        var search = tree(request("GET", "/api/search?q=persistent-test-123", null));
        assertEquals("performance", search.get("pages").get(0).get("page").asText());
    }

    @Test void concurrentSavesNeverSilentlyOverwrite() throws Exception {
        String path = "/api/pages/main/state";
        long revision = tree(request("GET", path, null)).get("revision").asLong();
        var futures = List.of("first", "second").stream().map(value -> {
            String body = json.writeValueAsString(Map.of("state", Map.of("admin", true, "writer", value), "revision", revision));
            var request = HttpRequest.newBuilder(uri(path)).header("Content-Type", "application/json").PUT(HttpRequest.BodyPublishers.ofString(body)).build();
            return http.sendAsync(request, HttpResponse.BodyHandlers.ofString());
        }).toList();
        CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new)).join();
        var statuses = futures.stream().map(future -> future.join().statusCode()).sorted().toList();
        assertEquals(List.of(200, 409), statuses);
        assertEquals(revision + 1, tree(request("GET", path, null)).get("revision").asLong());
    }

    @Test void uploadSearchDownloadDeleteUseRealStorage() throws Exception {
        String boundary = "ajin-" + UUID.randomUUID();
        String content = "실제 저장 검증 파일\nAJIN-ON\n";
        String multipart = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"scope\"\r\n\r\ninternal\r\n"
            + "--" + boundary + "\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\n자료 업로드 검증\r\n"
            + "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"../../evidence.txt\"\r\nContent-Type: text/plain\r\n\r\n" + content + "\r\n--" + boundary + "--\r\n";
        var upload = http.send(HttpRequest.newBuilder(uri("/api/documents")).header("Content-Type", "multipart/form-data; boundary=" + boundary)
            .POST(HttpRequest.BodyPublishers.ofString(multipart, StandardCharsets.UTF_8)).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(201, upload.statusCode());
        var doc = tree(upload);
        String id = doc.get("id").asText();
        assertEquals("evidence.txt", doc.get("filename").asText());
        assertEquals(content.getBytes(StandardCharsets.UTF_8).length, doc.get("size").asLong());
        assertTrue(Files.isRegularFile(STORAGE.resolve(id)));
        var search = tree(request("GET", "/api/documents/search?scope=internal&q=evidence", null));
        assertEquals(1, search.size());
        var download = request("GET", "/api/documents/" + id + "/download", null);
        assertEquals(200, download.statusCode());
        assertEquals(content, download.body());
        assertTrue(download.headers().firstValue("Content-Disposition").orElseThrow().startsWith("attachment;"));
        assertEquals("nosniff", download.headers().firstValue("X-Content-Type-Options").orElseThrow());
        assertEquals(204, request("DELETE", "/api/documents/" + id, null).statusCode());
        assertFalse(Files.exists(STORAGE.resolve(id)));
        assertEquals(404, request("GET", "/api/documents/" + id + "/download", null).statusCode());
    }

    @Test void searchShowsTheMatchingReferenceContentAndPageTitles() throws Exception {
        var referenceMatches = tree(request("GET", "/api/search?q=" + java.net.URLEncoder.encode("낙하품", StandardCharsets.UTF_8), null));
        assertTrue(referenceMatches.get("pages").size() > 0);
        for (var page : referenceMatches.get("pages")) assertTrue(page.get("excerpt").asText().contains("낙하품"));
        var titleMatches = tree(request("GET", "/api/search?q=" + java.net.URLEncoder.encode("품질5스타", StandardCharsets.UTF_8), null));
        assertTrue(titleMatches.get("pages").size() >= 2);
        assertEquals(0, tree(request("GET", "/api/search?q=critOpen", null)).get("pages").size());
    }

    @Test void storageHonorsRollbackAndAnOpenedDownloadSurvivesDeletion() throws Exception {
        var transaction = new TransactionTemplate(transactionManager);
        byte[] content = "transaction-safe-file".getBytes(StandardCharsets.UTF_8);
        var file = new MockMultipartFile("file", "transaction.txt", "text/plain", content);
        UUID rolledBack = transaction.execute(status -> {
            try {
                var uploaded = documents.upload(file, "test-tx", null, null);
                assertTrue(Files.exists(STORAGE.resolve(uploaded.id().toString())));
                status.setRollbackOnly();
                return uploaded.id();
            } catch (Exception exception) { throw new RuntimeException(exception); }
        });
        assertNotNull(rolledBack);
        assertFalse(Files.exists(STORAGE.resolve(rolledBack.toString())));
        assertThrows(ApiException.class, () -> documents.get(rolledBack));

        var uploaded = documents.upload(file, "test-tx", null, null);
        transaction.executeWithoutResult(status -> {
            documents.delete(uploaded.id());
            assertTrue(Files.exists(STORAGE.resolve(uploaded.id().toString())));
            status.setRollbackOnly();
        });
        assertEquals(uploaded.id(), documents.get(uploaded.id()).id());
        try (var alreadyOpen = documents.download(uploaded.id()).resource().getInputStream()) {
            documents.delete(uploaded.id());
            assertFalse(Files.exists(STORAGE.resolve(uploaded.id().toString())));
            assertArrayEquals(content, alreadyOpen.readAllBytes());
        }

        // A committed cleanup record left by a stopped process is recovered without metadata.
        var pending = documents.upload(file, "test-tx", null, null);
        jdbc.sql("INSERT INTO file_deletion_queue(id) VALUES(:id)").param("id", pending.id()).update();
        jdbc.sql("DELETE FROM documents WHERE id = :id").param("id", pending.id()).update();
        documents.retryPendingFileDeletions();
        assertFalse(Files.exists(STORAGE.resolve(pending.id().toString())));
        assertEquals(0L, jdbc.sql("SELECT count(*) FROM file_deletion_queue").query(Long.class).single());
    }

    @Test void evaluationImportIsAtomicDeduplicatedAndPreservesFilters() throws Exception {
        var before = tree(request("GET", "/api/pages/eval-history/state", null));
        var state = json.convertValue(before.get("state"), new tools.jackson.core.type.TypeReference<Map<String, Object>>() {});
        state.put("year", 2025);
        state.put("plant", "경산");
        state.put("view", "trend");
        var filtered = tree(request("PUT", "/api/pages/eval-history/state", Map.of("state", state, "revision", before.get("revision").asLong())));
        long revision = filtered.get("revision").asLong();
        Map<String, Object> first = Map.ofEntries(Map.entry("type", "내부 현장평가"), Map.entry("year", 2026), Map.entry("date", "2026-11-03"),
            Map.entry("round", 2), Map.entry("plant", "경산"), Map.entry("managementNumber", "IMPORT-001"), Map.entry("item", "2-2 작업환경 관리"),
            Map.entry("judgment", "일부미흡"), Map.entry("nonconformance", "낙하품 구역 식별 보완"), Map.entry("improvement", "전용 구역 표기"), Map.entry("actionStatus", "진행 중"));
        var second = new java.util.LinkedHashMap<>(first);
        second.put("managementNumber", "IMPORT-002"); second.put("judgment", "양호");
        var imported = request("POST", "/api/evaluations/import", Map.of("rows", List.of(first, second, second)));
        assertEquals(200, imported.statusCode());
        var result = tree(imported);
        assertEquals(2, result.get("imported").asInt());
        assertEquals(1, result.get("skipped").asInt());
        assertEquals(revision + 1, result.get("snapshot").get("revision").asLong());
        assertEquals(2025, result.get("snapshot").get("state").get("year").asInt());
        assertEquals("경산", result.get("snapshot").get("state").get("plant").asText());
        assertEquals("trend", result.get("snapshot").get("state").get("view").asText());
        assertEquals(2, result.get("snapshot").get("state").get("importedRows").size());
        var repeated = tree(request("POST", "/api/evaluations/import", Map.of("rows", List.of(first, second))));
        assertEquals(0, repeated.get("imported").asInt());
        assertEquals(2, repeated.get("skipped").asInt());
        assertEquals(revision + 1, repeated.get("snapshot").get("revision").asLong());
        var third = new java.util.LinkedHashMap<>(first);
        third.put("managementNumber", "IMPORT-003");
        var invalid = new java.util.LinkedHashMap<>(first);
        invalid.put("managementNumber", "IMPORT-004"); invalid.put("date", "2026-02-30"); invalid.put("year", 2026.5);
        var rejected = request("POST", "/api/evaluations/import", Map.of("rows", List.of(third, invalid)));
        assertEquals(400, rejected.statusCode());
        assertEquals("INVALID_IMPORT", tree(rejected).get("code").asText());
        assertTrue(tree(rejected).get("errors").size() >= 2);
        assertEquals(3, tree(rejected).get("errors").get(0).get("row").asInt());
        var unchanged = tree(request("GET", "/api/pages/eval-history/state", null));
        assertEquals(revision + 1, unchanged.get("revision").asLong());
        assertEquals(2, unchanged.get("state").get("importedRows").size());
        var history = tree(request("GET", "/api/pages/eval-history/history", null));
        assertEquals(revision + 1, history.get(0).get("revision").asLong());
        assertEquals(2, history.get(0).get("state").get("importedRows").size());

        var info = Map.of("evaluator", "평가원", "auditType", "불시", "criteriaVersion", "2026");
        var reviewed = Map.of("rows", List.of(third), "roundInfo", info);
        var saved = tree(request("POST", "/api/evaluations/import", reviewed));
        assertEquals(1, saved.path("imported").asInt());
        assertEquals("불시", saved.at("/snapshot/state/importedRows/2/roundInfo/auditType").asText());
        assertEquals(1, tree(request("POST", "/api/evaluations/import", reviewed)).path("skipped").asInt());
        third.put("improvement", "수정된 대책");
        assertEquals(409, request("POST", "/api/evaluations/import", reviewed).statusCode());
    }

    @Test void validatesRequestsAndRejectsForeignBrowserOrigin() throws Exception {
        assertEquals(404, request("GET", "/api/pages/unknown/state", null).statusCode());
        assertEquals(400, request("PUT", "/api/pages/internal/state", Map.of("state", Map.of(), "revision", -1)).statusCode());
        assertEquals(400, request("PUT", "/api/pages/internal/state", Map.of("revision", 0)).statusCode());
        assertEquals(400, request("GET", "/api/documents?scope=..%2Fprivate", null).statusCode());
        assertEquals(400, request("GET", "/api/search?q=", null).statusCode());
        assertEquals(400, request("GET", "/api/documents/not-a-uuid/download", null).statusCode());
        var foreign = http.send(HttpRequest.newBuilder(uri("/api/pages/main/state")).header("Origin", "https://untrusted.example")
            .header("Access-Control-Request-Method", "PUT").method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(403, foreign.statusCode());
    }
}
