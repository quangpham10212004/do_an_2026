package com.mmp.profile.storage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.net.URI;

/**
 * Object storage chuẩn S3 (MinIO trong docker compose; đổi sang AWS S3 / Cloudflare R2 chỉ cần đổi biến môi trường S3_*).
 * Không cấu hình (S3_ENDPOINT_URL trống và S3_ENABLED != true) thì {@link #enabled()} = false và service giữ cách lưu cũ trong CSDL.
 */
@Component
public class ObjectStorage {

    private final String bucket;
    private final S3Client client;

    public ObjectStorage(@Value("${app.storage.endpoint:}") String endpoint,
                         @Value("${app.storage.enabled:false}") boolean enabled,
                         @Value("${app.storage.access-key:}") String accessKey,
                         @Value("${app.storage.secret-key:}") String secretKey,
                         @Value("${app.storage.bucket:mmp-files}") String bucket,
                         @Value("${app.storage.region:us-east-1}") String region) {
        this.bucket = bucket;
        if (endpoint.isBlank() && !enabled) {
            this.client = null;
            return;
        }
        var builder = S3Client.builder()
                .region(Region.of(region))
                .forcePathStyle(true)
                .httpClientBuilder(UrlConnectionHttpClient.builder());
        if (!endpoint.isBlank()) {
            builder.endpointOverride(URI.create(endpoint));
        }
        builder.credentialsProvider(accessKey.isBlank()
                ? DefaultCredentialsProvider.create()
                : StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)));
        this.client = builder.build();
    }

    public boolean enabled() {
        return client != null;
    }

    public void put(String key, byte[] data, String contentType) {
        try {
            client.putObject(r -> r.bucket(bucket).key(key).contentType(contentType), RequestBody.fromBytes(data));
        } catch (RuntimeException e) {
            throw new StorageException("Không lưu được file lên object storage", e);
        }
    }

    /** Nội dung file, hoặc null nếu key không tồn tại. */
    public byte[] get(String key) {
        try {
            return client.getObjectAsBytes(r -> r.bucket(bucket).key(key)).asByteArray();
        } catch (NoSuchKeyException e) {
            return null;
        } catch (S3Exception e) {
            if (e.statusCode() == 404) return null;
            throw new StorageException("Không đọc được file từ object storage", e);
        } catch (RuntimeException e) {
            throw new StorageException("Không đọc được file từ object storage", e);
        }
    }

    /** Xoá key; key không tồn tại thì bỏ qua. Lỗi mạng không làm hỏng nghiệp vụ gọi nó — chỉ ném StorageException. */
    public void delete(String key) {
        try {
            client.deleteObject(r -> r.bucket(bucket).key(key));
        } catch (RuntimeException e) {
            throw new StorageException("Không xoá được file trên object storage", e);
        }
    }

    public static class StorageException extends RuntimeException {
        public StorageException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
