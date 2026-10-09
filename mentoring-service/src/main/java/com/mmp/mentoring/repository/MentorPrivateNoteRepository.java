package com.mmp.mentoring.repository;

import com.mmp.mentoring.entity.MentorPrivateNote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

/** US-40 — ghi chú riêng của mentor. */
public interface MentorPrivateNoteRepository extends JpaRepository<MentorPrivateNote, UUID> {
}
