CREATE TABLE cv_privacy_preferences (
    user_id UUID PRIMARY KEY,
    allow_external_ai BOOLEAN NOT NULL
);
