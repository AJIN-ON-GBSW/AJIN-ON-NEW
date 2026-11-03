package kr.ajin.on;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@RestControllerAdvice
class ApiErrorHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiErrorHandler.class);
    @ExceptionHandler(EvaluationImportService.InvalidImport.class)
    ResponseEntity<Map<String, Object>> invalidImport(EvaluationImportService.InvalidImport exception) {
        Map<String, Object> body = error(400, "INVALID_IMPORT", exception.getMessage());
        body.put("errors", exception.errors);
        return ResponseEntity.badRequest().body(body);
    }
    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, Object>> application(ApiException error) {
        Map<String, Object> body = error(error.status, error.code, error.getMessage());
        if (error.currentRevision != null) body.put("currentRevision", error.currentRevision);
        return ResponseEntity.status(error.status).body(body);
    }
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
        MethodArgumentTypeMismatchException.class, MissingServletRequestParameterException.class, MissingServletRequestPartException.class})
    ResponseEntity<Map<String, Object>> validation(Exception exception) {
        return ResponseEntity.badRequest().body(error(400, "INVALID_REQUEST", "입력값을 확인해 주세요."));
    }
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<Map<String, Object>> tooLarge(MaxUploadSizeExceededException exception) {
        return ResponseEntity.status(413).body(error(413, "FILE_TOO_LARGE", "파일은 25MB 이하로 업로드해 주세요."));
    }
    @ExceptionHandler(IOException.class)
    ResponseEntity<Map<String, Object>> storage(IOException exception) {
        log.error("Document storage operation failed", exception);
        return ResponseEntity.internalServerError().body(error(500, "STORAGE_ERROR", "자료 저장소를 확인해 주세요. 잠시 후 다시 시도해 주세요."));
    }
    private Map<String, Object> error(int status, String code, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", status); body.put("code", code); body.put("message", message);
        return body;
    }
}
