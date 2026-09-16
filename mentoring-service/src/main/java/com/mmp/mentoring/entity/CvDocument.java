package com.mmp.mentoring.entity;

import jakarta.persistence.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "cv_documents")
public class CvDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "storage_path", nullable = false)
    private String storagePath;

    @Column(name = "raw_text", nullable = false)
    private String rawText;

    @Column(name = "parsed_json", nullable = false)
    private String parsedJson;

    @Column(nullable = false)
    private String engine;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    protected CvDocument() {
    }

    public CvDocument(UUID userId, String fileName, String storagePath, String rawText, String parsedJson, String engine) {
        this.userId = userId;
        this.fileName = fileName;
        this.storagePath = storagePath;
        this.rawText = rawText;
        this.parsedJson = parsedJson;
        this.engine = engine;
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getFileName() { return fileName; }
    public String getStoragePath() { return storagePath; }
    public String getRawText() { return rawText; }
    public String getParsedJson() { return parsedJson; }
    public String getEngine() { return engine; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
}
