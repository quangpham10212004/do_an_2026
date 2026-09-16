package com.mmp.mentoring.service;

import com.mmp.mentoring.exception.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

/** Lưu file CV trên đĩa (docker volume). Có thể thay bằng object storage (S3/MinIO) khi triển khai thật. */
@Component
public class CvStorage {

    private final Path root;

    public CvStorage(@Value("${app.storage.cv-dir}") String dir) {
        this.root = Path.of(dir).toAbsolutePath().normalize();
    }

    public String save(UUID userId, byte[] content) {
        try {
            Path folder = root.resolve(userId.toString());
            Files.createDirectories(folder);
            Path file = folder.resolve(UUID.randomUUID() + ".pdf");
            Files.write(file, content);
            return root.relativize(file).toString();
        } catch (IOException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "STORAGE_ERROR", "Không thể lưu file CV");
        }
    }

    public byte[] read(String relativePath) {
        Path file = root.resolve(relativePath).normalize();
        if (!file.startsWith(root)) {
            throw ApiException.forbidden("Đường dẫn file không hợp lệ");
        }
        try {
            return Files.readAllBytes(file);
        } catch (IOException e) {
            throw ApiException.notFound("CV_FILE_NOT_FOUND", "Không tìm thấy file CV");
        }
    }
}
