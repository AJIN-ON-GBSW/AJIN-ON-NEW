package kr.ajin.on;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import jakarta.validation.constraints.Size;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class EvaluationImportService {
    private static final Set<String> TYPES = Set.of("내부 현장평가", "품질5스타", "SQ평가", "IATF 16949");
    private static final Set<String> JUDGMENTS = Set.of("보완", "일부미흡", "다수미흡", "양호", "미기재", "Major", "Minor", "OFI");
    private static final Set<String> FIELDS = Set.of("type", "year", "date", "round", "plant", "managementNumber", "item", "judgment", "nonconformance", "improvement", "actionStatus");
    private final JdbcClient jdbc;
    private final PageService pages;
    private final ObjectMapper mapper;
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    EvaluationImportService(JdbcClient jdbc, PageService pages, ObjectMapper mapper) {
        this.jdbc = jdbc; this.pages = pages; this.mapper = mapper;
    }

    public record RoundInfo(@Size(max=50) String evaluator, @Size(max=20) String auditType, @Size(max=80) String criteriaVersion) {}
    public record EvaluationRow(String type, int year, String date, int round, String plant, String managementNumber,
        String item, String judgment, String nonconformance, String improvement, String actionStatus) {}
    public record ImportResult(int imported, int skipped, PageService.Snapshot snapshot) {}
    public record ImportError(int row, String field, String message) {}
    static final class InvalidImport extends RuntimeException {
        final List<ImportError> errors;
        InvalidImport(List<ImportError> errors) {
            super("엑셀 입력값을 확인해 주세요. 모든 행이 올바른 경우에만 등록합니다.");
            this.errors = List.copyOf(errors);
        }
    }

    @Transactional
    public ImportResult importRows(List<JsonNode> input, RoundInfo info) {
        List<EvaluationRow> validated = validate(input);
        // A lock serializes simultaneous imports and preserves unrelated filters and screen edits.
        jdbc.sql("SELECT page FROM page_state WHERE page = 'eval-history' FOR UPDATE").query(String.class).single();
        var current = pages.get("eval-history");
        var state = new LinkedHashMap<>(current.state());
        Object previous = state.get("importedRows");
        if (previous != null && !(previous instanceof List<?>))
            throw new ApiException(409, "INVALID_IMPORT_STORAGE", "기존 평가 등록 데이터 형식을 확인해 주세요.");
        var rows = new ArrayList<Object>();
        if (previous instanceof List<?> list) rows.addAll(list);
        Map<List<Object>, Map<?,?>> identities = new java.util.HashMap<>();
        for (Object existing : rows) if (existing instanceof Map<?, ?> row) identities.put(identity(row),row);
        int imported = 0;
        int skipped = 0;
        for (EvaluationRow row : validated) {
            Map<String, Object> values = mapper.convertValue(row, MAP);
            if (info != null) {
                if (!row.type().equals("내부 현장평가") || !Set.of("양호","보완","일부미흡","다수미흡").contains(row.judgment()))
                    throw new ApiException(400,"INVALID_REVIEW","내부 평가이력 판정은 양호, 보완, 일부미흡, 다수미흡 중 선택해 주세요.");
                values.put("roundInfo", mapper.convertValue(info, MAP));
            }
            var prior = identities.putIfAbsent(identity(values),values);
            if (prior == null) { rows.add(values); imported++; }
            else if (info != null && !prior.equals(values)) {
                throw new ApiException(409,"REVIEW_CHANGED","이미 등록된 평가와 내용이 다릅니다. 수정된 평가를 새로 생성해 등록해 주세요.");
            } else skipped++;
        }
        if (imported == 0) return new ImportResult(0, skipped, current);
        state.put("importedRows", rows);
        return new ImportResult(imported, skipped, pages.save("eval-history", state, current.revision()));
    }

    private List<EvaluationRow> validate(List<JsonNode> input) {
        if (input == null || input.isEmpty() || input.size() > 1000)
            throw new InvalidImport(List.of(new ImportError(1, "rows", "한 번에 1~1000개 행을 등록할 수 있습니다.")));
        if (mapper.writeValueAsString(input).getBytes(StandardCharsets.UTF_8).length > 1024 * 1024)
            throw new InvalidImport(List.of(new ImportError(1, "rows", "한 번에 등록하는 JSON 데이터는 1MB 이하여야 합니다.")));
        var errors = new ArrayList<ImportError>();
        var result = new ArrayList<EvaluationRow>();
        for (int index = 0; index < input.size(); index++) {
            int rowNumber = index + 2; // Row one contains the workbook's eleven column headers.
            JsonNode row = input.get(index);
            if (row == null || !row.isObject()) {
                errors.add(new ImportError(rowNumber, "row", "행은 열 이름과 값으로 구성되어야 합니다."));
                continue;
            }
            for (String field : row.propertyNames()) if (!FIELDS.contains(field))
                errors.add(new ImportError(rowNumber, field, "알 수 없는 열입니다."));
            String type = text(row, "type", 30, true, rowNumber, errors);
            int year = integer(row, "year", 2000, 2100, rowNumber, errors);
            String date = text(row, "date", 10, true, rowNumber, errors);
            int round = integer(row, "round", 1, 10, rowNumber, errors);
            String plant = text(row, "plant", 150, true, rowNumber, errors);
            String managementNumber = text(row, "managementNumber", 100, true, rowNumber, errors);
            String item = text(row, "item", 300, true, rowNumber, errors);
            String judgment = text(row, "judgment", 30, true, rowNumber, errors);
            String nonconformance = text(row, "nonconformance", 20_000, false, rowNumber, errors);
            String improvement = text(row, "improvement", 20_000, false, rowNumber, errors);
            String actionStatus = text(row, "actionStatus", 100, false, rowNumber, errors);
            if (!TYPES.contains(type)) errors.add(new ImportError(rowNumber, "type", "평가 종류는 내부 현장평가, 품질5스타, SQ평가, IATF 16949 중 선택해 주세요."));
            if (!JUDGMENTS.contains(judgment)) errors.add(new ImportError(rowNumber, "judgment", "판정은 보완, 일부미흡, 다수미흡, 양호, 미기재, Major, Minor, OFI 중 선택해 주세요."));
            try {
                if (!date.matches("\\d{4}-\\d{2}-\\d{2}")) throw new DateTimeParseException("Invalid date format", date, 0);
                LocalDate.parse(date);
            } catch (DateTimeParseException exception) {
                errors.add(new ImportError(rowNumber, "date", "점검일은 실제 존재하는 날짜를 YYYY-MM-DD로 입력해 주세요."));
            }
            result.add(new EvaluationRow(type, year, date, round, plant, managementNumber, item, judgment, nonconformance, improvement, actionStatus));
        }
        if (!errors.isEmpty()) throw new InvalidImport(errors);
        return result;
    }

    private String text(JsonNode row, String field, int maximum, boolean required, int number, List<ImportError> errors) {
        JsonNode value = row.get(field);
        if (value == null || value.isNull()) {
            if (required) errors.add(new ImportError(number, field, "필수 항목입니다."));
            return "";
        }
        if (!value.isString()) { errors.add(new ImportError(number, field, "문자로 입력해 주세요.")); return ""; }
        String text = value.asText().strip();
        if (required && text.isEmpty()) errors.add(new ImportError(number, field, "필수 항목입니다."));
        if (text.length() > maximum) errors.add(new ImportError(number, field, maximum + "자 이하로 입력해 주세요."));
        if (text.indexOf('\0') >= 0) errors.add(new ImportError(number, field, "사용할 수 없는 문자가 포함되어 있습니다."));
        return text;
    }

    private int integer(JsonNode row, String field, int minimum, int maximum, int number, List<ImportError> errors) {
        JsonNode value = row.get(field);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToInt() || value.asInt() < minimum || value.asInt() > maximum) {
            errors.add(new ImportError(number, field, minimum + "~" + maximum + " 범위의 정수를 입력해 주세요."));
            return minimum;
        }
        return value.asInt();
    }

    private List<Object> identity(Map<?, ?> row) {
        return List.of(String.valueOf(row.get("type")), String.valueOf(row.get("year")), String.valueOf(row.get("plant")),
            String.valueOf(row.get("managementNumber")), String.valueOf(row.get("date")));
    }
}
