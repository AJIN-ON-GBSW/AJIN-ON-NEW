package kr.ajin.on;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api/assessment/library")
class AssessmentLibrary {
    record Entry(String name, UUID revision, Map<String, Object> data) {}
    private final JdbcClient jdbc;
    private final PageService pages;
    private final ObjectMapper json;

    AssessmentLibrary(JdbcClient jdbc, PageService pages, ObjectMapper json) {
        this.jdbc = jdbc;
        this.pages = pages;
        this.json = json;
    }

    @GetMapping
    List<Entry> entries() {
        return jdbc.sql("SELECT name, revision, data::text FROM assessment_library WHERE active ORDER BY name")
            .query((rs, _) -> new Entry(rs.getString(1), rs.getObject(2, UUID.class), pages.parse(rs.getString(3)))).list();
    }

    // Apply a workbook and its settings together. Each edited entry must still have the revision the editor read.
    @PostMapping
    @Transactional
    Map<String, UUID> apply(@RequestBody List<Entry> changes) {
        if (changes.isEmpty() || changes.size() > 500 || json.writeValueAsBytes(changes).length > 8 * 1024 * 1024)
            throw new ApiException(400, "INVALID_LIBRARY", "등록 범위를 줄여 다시 시도해 주세요.");
        var names = new HashSet<String>();
        var versions = new java.util.HashMap<String, UUID>();
        for (var change : changes) {
            if (change == null || change.name() == null || !change.name().matches("(cfg|crit|hist|metrics)/[a-zA-Z0-9_-]{1,400}") || !names.add(change.name()))
                throw new ApiException(400, "INVALID_LIBRARY", "기준·이력 식별자를 확인해 주세요.");
        }
        for (var change : changes.stream().sorted(java.util.Comparator.comparing(Entry::name)).toList()) {
            var next = UUID.randomUUID();
            int count;
            if (change.data() == null) {
                count = jdbc.sql("UPDATE assessment_library SET active=false, revision=:next WHERE name=:name AND revision=:rev AND active")
                    .param("name", change.name()).param("next",next).param("rev", change.revision()).update();
            } else {
                var data = json.writeValueAsString(change.data());
                if (data.getBytes(StandardCharsets.UTF_8).length > 1024 * 1024)
                    throw new ApiException(413, "ENTRY_TOO_LARGE", "한 묶음은 1MB 이하로 저장해 주세요.");
                if (change.revision() == null) {
                    count = jdbc.sql("INSERT INTO assessment_library(name,revision,data) VALUES (:name,:next,CAST(:data AS jsonb)) ON CONFLICT(name) DO UPDATE SET active=true, revision=excluded.revision, data=excluded.data WHERE NOT assessment_library.active")
                        .param("name", change.name()).param("next", next).param("data", data).update();
                } else {
                    count = jdbc.sql("UPDATE assessment_library SET revision=:next, data=CAST(:data AS jsonb) WHERE name=:name AND revision=:rev AND active")
                        .param("name", change.name()).param("next", next).param("data", data).param("rev", change.revision()).update();
                }
                versions.put(change.name(), next);
            }
            if (count != 1) throw new ApiException(409, "REVISION_CONFLICT", "다른 사용자가 기준·이력을 변경했습니다. 새로고침 후 다시 등록해 주세요.");
        }
        return versions;
    }
}
