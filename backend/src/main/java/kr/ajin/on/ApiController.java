package kr.ajin.on;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api")
public class ApiController {
    private final PageService pages;
    private final DocumentService documents;
    private final EvaluationImportService evaluations;
    ApiController(PageService pages, DocumentService documents, EvaluationImportService evaluations) { this.pages = pages; this.documents = documents; this.evaluations = evaluations; }
    public record ImportEvaluations(List<JsonNode> rows, @Valid EvaluationImportService.RoundInfo roundInfo) {}
    @PostMapping("/evaluations/import")
    EvaluationImportService.ImportResult importEvaluations(@RequestBody ImportEvaluations body) { return evaluations.importRows(body.rows(), body.roundInfo()); }

    public record SaveState(@NotNull Map<String, Object> state, @NotNull @PositiveOrZero Long revision) {}

    @GetMapping("/pages")
    Map<String, String> pageList() { return PageService.PAGES; }
    @GetMapping("/pages/{page}/state")
    PageService.Snapshot state(@PathVariable String page) { return pages.get(page); }
    @PutMapping("/pages/{page}/state")
    PageService.Snapshot save(@PathVariable String page, @Valid @RequestBody SaveState body) { return pages.save(page, body.state(), body.revision()); }
    @GetMapping("/pages/{page}/history")
    List<PageService.Snapshot> history(@PathVariable String page) { return pages.history(page); }
    @GetMapping("/pages/{page}/reference")
    Map<String, Object> reference(@PathVariable String page) { return pages.reference(page); }
    @GetMapping("/reference")
    Map<String, Object> allReference() {
        Map<String, Object> result = new LinkedHashMap<>();
        PageService.PAGES.keySet().forEach(page -> result.put(page, pages.reference(page)));
        return result;
    }

    @GetMapping({"/documents", "/documents/search"})
    List<DocumentService.Document> list(@RequestParam(required = false) String scope, @RequestParam(required = false) String q) { return documents.list(scope, q); }
    @PostMapping(path = "/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ResponseEntity<DocumentService.Document> upload(@RequestParam MultipartFile file, @RequestParam String scope,
            @RequestParam(required = false) String title, @RequestParam(required = false) String category) throws IOException {
        return ResponseEntity.status(HttpStatus.CREATED).body(documents.upload(file, scope, title, category));
    }
    @GetMapping("/documents/{id}/download")
    ResponseEntity<Resource> download(@PathVariable UUID id) throws IOException {
        var download = documents.download(id);
        return ResponseEntity.ok().contentLength(download.metadata().size())
            .contentType(MediaType.parseMediaType(download.metadata().contentType()))
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(download.metadata().filename(), StandardCharsets.UTF_8).build().toString())
            .body(download.resource());
    }
    @DeleteMapping("/documents/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id) throws IOException { documents.delete(id); }
    @GetMapping("/search")
    Map<String, Object> search(@RequestParam String q) {
        String query = q.strip();
        if (query.isEmpty() || query.length() > 100) throw new ApiException(400, "INVALID_QUERY", "검색어는 1~100자로 입력해 주세요.");
        return Map.of("query", query, "pages", pages.search(query), "documents", documents.list(null, query));
    }
}
