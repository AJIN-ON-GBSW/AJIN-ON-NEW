package kr.ajin.on;

final class ApiException extends RuntimeException {
    final int status;
    final String code;
    final Long currentRevision;

    ApiException(int status, String code, String message) {
        this(status, code, message, null);
    }

    ApiException(int status, String code, String message, Long currentRevision) {
        super(message);
        this.status = status;
        this.code = code;
        this.currentRevision = currentRevision;
    }
}
