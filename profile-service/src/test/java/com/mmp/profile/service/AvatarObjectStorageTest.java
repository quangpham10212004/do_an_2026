package com.mmp.profile.service;

import com.mmp.profile.client.MatchingIndexClient;
import com.mmp.profile.entity.MenteeProfile;
import com.mmp.profile.entity.ProfileAvatar;
import com.mmp.profile.exception.ApiException;
import com.mmp.profile.repository.*;
import com.mmp.profile.storage.ObjectStorage;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** Ảnh đại diện lưu ở object storage (MinIO/S3) khi bật cấu hình; ảnh cũ trong CSDL vẫn đọc được. */
class AvatarObjectStorageTest {

    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3};

    private final MentorProfileRepository mentorRepo = mock(MentorProfileRepository.class);
    private final MenteeProfileRepository menteeRepo = mock(MenteeProfileRepository.class);
    private final ProfileAvatarRepository avatarRepo = mock(ProfileAvatarRepository.class);
    private final TransactionTemplate tx = mock(TransactionTemplate.class);
    private final ObjectStorage storage = mock(ObjectStorage.class);
    private final ProfileService service = new ProfileService(mentorRepo, menteeRepo,
            mock(MentorAvailabilityRepository.class), mock(MentorAvailabilityExceptionRepository.class),
            mock(MatchingIndexClient.class), tx, Clock.systemUTC(), avatarRepo);
    private final UUID id = UUID.randomUUID();

    @SuppressWarnings("unchecked")
    AvatarObjectStorageTest() {
        doAnswer(inv -> {
            ((Consumer<TransactionStatus>) inv.getArgument(0)).accept(null);
            return null;
        }).when(tx).executeWithoutResult(any());
        when(menteeRepo.findById(id)).thenReturn(Optional.of(new MenteeProfile()));
        when(avatarRepo.findUpdatedAt(any())).thenReturn(Optional.of(OffsetDateTime.now()));
        service.setObjectStorage(storage);
    }

    @Test
    void uploadGoesToObjectStorageAndRowKeepsOnlyTheKey() {
        when(storage.enabled()).thenReturn(true);
        when(avatarRepo.findById(id)).thenReturn(Optional.empty());

        service.uploadAvatar(id, PNG);

        ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
        verify(storage).put(key.capture(), eq(PNG), eq("image/png"));
        assertThat(key.getValue()).startsWith("avatars/" + id + "/");
        ArgumentCaptor<ProfileAvatar> row = ArgumentCaptor.forClass(ProfileAvatar.class);
        verify(avatarRepo).save(row.capture());
        assertThat(row.getValue().getStorageKey()).isEqualTo(key.getValue());
        assertThat(row.getValue().getData()).isNull();
    }

    @Test
    void replacingAvatarDeletesThePreviousObject() {
        when(storage.enabled()).thenReturn(true);
        when(avatarRepo.findById(id)).thenReturn(Optional.of(
                ProfileAvatar.stored(id, "image/png", "avatars/" + id + "/old", OffsetDateTime.now())));

        service.uploadAvatar(id, PNG);

        verify(storage).delete("avatars/" + id + "/old");
    }

    @Test
    void failedCleanupOfOldObjectDoesNotFailTheUpload() {
        when(storage.enabled()).thenReturn(true);
        when(avatarRepo.findById(id)).thenReturn(Optional.of(
                ProfileAvatar.stored(id, "image/png", "avatars/" + id + "/old", OffsetDateTime.now())));
        doThrow(new ObjectStorage.StorageException("down", null)).when(storage).delete(anyString());

        assertThat(service.uploadAvatar(id, PNG).avatarUrl()).contains("/api/profile/avatars/" + id);
    }

    @Test
    void storageDisabledKeepsImageInDatabase() {
        when(storage.enabled()).thenReturn(false);
        when(avatarRepo.findById(id)).thenReturn(Optional.empty());

        service.uploadAvatar(id, PNG);

        verify(storage, never()).put(anyString(), any(), anyString());
        ArgumentCaptor<ProfileAvatar> row = ArgumentCaptor.forClass(ProfileAvatar.class);
        verify(avatarRepo).save(row.capture());
        assertThat(row.getValue().getData()).isEqualTo(PNG);
        assertThat(row.getValue().getStorageKey()).isNull();
    }

    @Test
    void readsStoredImageFromObjectStorageAndLegacyImageFromRow() {
        ProfileAvatar stored = ProfileAvatar.stored(id, "image/png", "avatars/" + id + "/k", OffsetDateTime.now());
        when(storage.get("avatars/" + id + "/k")).thenReturn(PNG);
        assertThat(service.avatarBytes(stored)).isEqualTo(PNG);

        ProfileAvatar legacy = new ProfileAvatar(id, "image/png", PNG, OffsetDateTime.now());
        assertThat(service.avatarBytes(legacy)).isEqualTo(PNG);
        verify(storage, times(1)).get(anyString());
    }

    @Test
    void missingObjectIsReportedAsNoAvatar() {
        ProfileAvatar stored = ProfileAvatar.stored(id, "image/png", "avatars/" + id + "/gone", OffsetDateTime.now());
        when(storage.get(anyString())).thenReturn(null);
        assertThatThrownBy(() -> service.avatarBytes(stored)).isInstanceOf(ApiException.class);
    }

    @Test
    void deleteAvatarAlsoRemovesTheObject() {
        when(avatarRepo.findById(id)).thenReturn(Optional.of(
                ProfileAvatar.stored(id, "image/png", "avatars/" + id + "/k", OffsetDateTime.now())));

        service.deleteAvatar(id);

        verify(avatarRepo).deleteById(id);
        verify(storage).delete("avatars/" + id + "/k");
    }
}
