package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.CvDocument;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface CvDocumentRepository extends JpaRepository<CvDocument, UUID> {
}
