package kr.ajin.on;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.StringJoiner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Service
public class PageService {
    public static final Map<String, String> PAGES = Map.of(
        "main", "홈", "qstar", "품질5스타", "field-audit", "품질5스타 현장평가",
        "internal", "내부 현장평가", "sq", "SQ평가", "iatf", "IATF 16949",
        "performance", "실적 관리", "eval-history", "평가 이력 통합 조회");
    private final JdbcClient jdbc;
    private final ObjectMapper mapper;
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    PageService(JdbcClient jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public record Snapshot(String page, Map<String, Object> state, long revision, Instant updatedAt) {}
    public record SearchPage(String page, String title, String excerpt) {}

    public void validatePage(String page) {
        if (!PAGES.containsKey(page)) throw new ApiException(404, "PAGE_NOT_FOUND", "페이지를 찾을 수 없습니다.");
    }

    public Snapshot get(String page) {
        validatePage(page);
        return jdbc.sql("SELECT page, state::text AS state, revision, updated_at FROM page_state WHERE page = :page")
            .param("page", page).query((rs, _) -> new Snapshot(rs.getString("page"), parse(rs.getString("state")),
                rs.getLong("revision"), rs.getTimestamp("updated_at").toInstant())).single();
    }

    @Transactional
    public Snapshot save(String page, Map<String, Object> state, long revision) {
        validatePage(page);
        checkDepth(state, 0);
        String json = mapper.writeValueAsString(state);
        if (json.getBytes(StandardCharsets.UTF_8).length > 1024 * 1024)
            throw new ApiException(413, "STATE_TOO_LARGE", "페이지 데이터는 1MB 이하로 저장해 주세요.");
        int updated = jdbc.sql("UPDATE page_state SET state = CAST(:state AS jsonb), revision = revision + 1, updated_at = now() WHERE page = :page AND revision = :revision")
            .param("state", json).param("page", page).param("revision", revision).update();
        if (updated == 0) {
            throw new ApiException(409, "REVISION_CONFLICT", "다른 변경이 먼저 저장되었습니다. 최신 데이터를 불러온 뒤 다시 저장해 주세요.", get(page).revision());
        }
        jdbc.sql("INSERT INTO page_state_history(page, revision, state) VALUES (:page, :revision, CAST(:state AS jsonb))")
            .param("page", page).param("revision", revision + 1).param("state", json).update();
        // Keep the latest 100 snapshots per page; current state is always retained separately.
        jdbc.sql("DELETE FROM page_state_history WHERE page = :page AND revision < :oldest")
            .param("page", page).param("oldest", Math.max(0, revision - 98)).update();
        return get(page);
    }

    public List<Snapshot> history(String page) {
        validatePage(page);
        return jdbc.sql("SELECT page, state::text AS state, revision, saved_at FROM page_state_history WHERE page = :page ORDER BY revision DESC LIMIT 50")
            .param("page", page).query((rs, _) -> new Snapshot(rs.getString("page"), parse(rs.getString("state")),
                rs.getLong("revision"), rs.getTimestamp("saved_at").toInstant())).list();
    }

    public Map<String, Object> reference(String page) {
        validatePage(page);
        return jdbc.sql("SELECT data::text FROM page_reference WHERE page = :page").param("page", page)
            .query((rs, _) -> parse(rs.getString(1))).single();
    }

    public List<SearchPage> search(String query) {
        // Eight bounded page documents: search visible values and titles rather than internal JSON keys.
        String needle = query.toLowerCase(Locale.ROOT);
        return jdbc.sql("SELECT p.page, p.state::text AS state, r.data::text AS reference FROM page_state p LEFT JOIN page_reference r ON r.page = p.page ORDER BY p.page")
            .query((rs, _) -> {
                String page = rs.getString("page");
                String state = visibleText(parse(rs.getString("state")));
                String referenceJson = rs.getString("reference");
                String reference = referenceJson == null ? "" : visibleText(parse(referenceJson));
                String title = PAGES.get(page);
                String source = state.toLowerCase(Locale.ROOT).contains(needle) ? state
                    : reference.toLowerCase(Locale.ROOT).contains(needle) ? reference
                    : title.toLowerCase(Locale.ROOT).contains(needle) ? title : null;
                if (source == null) return null;
                int match = source.toLowerCase(Locale.ROOT).indexOf(needle);
                int start = Math.max(0, match - 40);
                return new SearchPage(page, title, source.substring(start, Math.min(source.length(), start + 180)));
            }).list().stream().filter(java.util.Objects::nonNull).toList();
    }

    private String visibleText(Object value) {
        if (value instanceof String text) return text;
        if (value instanceof Number number) return number.toString();
        StringJoiner text = new StringJoiner(" · ");
        if (value instanceof Map<?, ?> map) map.values().forEach(child -> {
            String part = visibleText(child); if (!part.isBlank()) text.add(part);
        });
        else if (value instanceof List<?> list) list.forEach(child -> {
            String part = visibleText(child); if (!part.isBlank()) text.add(part);
        });
        return text.toString();
    }

    static String escapeLike(String value) { return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_"); }
    Map<String, Object> parse(String json) { return mapper.readValue(json, MAP_TYPE); }

    private void checkDepth(Object value, int depth) {
        if (depth > 48) throw new ApiException(400, "INVALID_STATE", "페이지 데이터의 중첩 깊이가 너무 큽니다.");
        if (value instanceof Map<?, ?> map) for (Object child : map.values()) checkDepth(child, depth + 1);
        else if (value instanceof List<?> list) for (Object child : list) checkDepth(child, depth + 1);
    }
}
