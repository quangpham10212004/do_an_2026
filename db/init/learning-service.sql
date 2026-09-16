-- learning-service database init (learning_db)
-- Chạy tự động khi docker compose up lần đầu (mount vào /docker-entrypoint-initdb.d)

CREATE TABLE IF NOT EXISTS courses (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT NOT NULL,
    description  TEXT,
    domain       TEXT NOT NULL,
    level        TEXT NOT NULL DEFAULT 'BEGINNER' CHECK (level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
    skills       TEXT[] NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tài liệu (bài học) thuộc 1 khoá học
CREATE TABLE IF NOT EXISTS course_materials (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    type         TEXT NOT NULL DEFAULT 'ARTICLE' CHECK (type IN ('ARTICLE', 'VIDEO', 'DOCUMENT', 'EXERCISE')),
    url          TEXT,
    content      TEXT,
    order_index  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_course_materials_course ON course_materials (course_id, order_index);

CREATE TABLE IF NOT EXISTS course_enrollments (
    course_id    UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL,
    enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS material_completions (
    material_id   UUID NOT NULL REFERENCES course_materials(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL,
    completed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (material_id, user_id)
);

-- percent_complete được tính lại mỗi khi user hoàn thành/bỏ đánh dấu 1 tài liệu
CREATE TABLE IF NOT EXISTS course_progress (
    course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL,
    percent_complete REAL NOT NULL DEFAULT 0,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS roadmaps (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT NOT NULL,
    track        TEXT NOT NULL,                 -- Backend, Frontend, DevOps, ...
    description  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roadmap_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roadmap_id   UUID NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT,
    order_index  INTEGER NOT NULL DEFAULT 0,
    course_id    UUID REFERENCES courses(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_roadmap_items_roadmap ON roadmap_items (roadmap_id, order_index);

CREATE TABLE IF NOT EXISTS roadmap_item_progress (
    item_id       UUID NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL,
    completed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (item_id, user_id)
);

-- ---------- Seed dữ liệu mẫu Learning Hub ----------

INSERT INTO courses (id, title, description, domain, level, skills) VALUES
 ('11111111-0000-0000-0000-000000000001', 'Java Spring Boot căn bản', 'Xây dựng REST API với Spring Boot, JPA và PostgreSQL.', 'backend', 'BEGINNER', '{Java,Spring Boot,REST API,PostgreSQL}'),
 ('11111111-0000-0000-0000-000000000002', 'System Design cho phỏng vấn', 'Các khối cơ bản: load balancer, cache, queue, sharding.', 'backend', 'ADVANCED', '{System Design,Redis,Kafka,Microservices}'),
 ('11111111-0000-0000-0000-000000000003', 'React & Next.js thực chiến', 'Component, hooks, routing và data fetching với Next.js 14.', 'frontend', 'INTERMEDIATE', '{React,Next.js,JavaScript,TypeScript}'),
 ('11111111-0000-0000-0000-000000000004', 'Docker & CI/CD nhập môn', 'Container hoá ứng dụng và pipeline GitHub Actions.', 'devops', 'BEGINNER', '{Docker,GitHub Actions,Linux,CI/CD}'),
 ('11111111-0000-0000-0000-000000000005', 'Machine Learning với Python', 'Pandas, scikit-learn và quy trình huấn luyện mô hình.', 'data', 'INTERMEDIATE', '{Python,Pandas,scikit-learn,Machine Learning}')
ON CONFLICT DO NOTHING;

INSERT INTO course_materials (course_id, title, type, url, content, order_index) VALUES
 ('11111111-0000-0000-0000-000000000001', 'Giới thiệu Spring Boot', 'ARTICLE', 'https://spring.io/guides/gs/spring-boot', 'Tổng quan Spring Boot, auto-configuration và starter.', 1),
 ('11111111-0000-0000-0000-000000000001', 'Xây dựng REST controller', 'VIDEO', 'https://spring.io/guides/gs/rest-service', 'Tạo endpoint GET/POST, validate request.', 2),
 ('11111111-0000-0000-0000-000000000001', 'Spring Data JPA với PostgreSQL', 'DOCUMENT', 'https://spring.io/guides/gs/accessing-data-jpa', 'Entity, repository, query method.', 3),
 ('11111111-0000-0000-0000-000000000001', 'Bài tập: API quản lý sách', 'EXERCISE', NULL, 'Xây dựng CRUD API cho thực thể Book.', 4),
 ('11111111-0000-0000-0000-000000000002', 'Scalability cơ bản', 'ARTICLE', 'https://github.com/donnemartin/system-design-primer', 'Vertical vs horizontal scaling.', 1),
 ('11111111-0000-0000-0000-000000000002', 'Caching với Redis', 'ARTICLE', 'https://redis.io/docs/latest/', 'Cache-aside, TTL, eviction.', 2),
 ('11111111-0000-0000-0000-000000000002', 'Message queue & event-driven', 'VIDEO', 'https://kafka.apache.org/documentation/', 'Kafka topic, partition, consumer group.', 3),
 ('11111111-0000-0000-0000-000000000003', 'React hooks', 'ARTICLE', 'https://react.dev/reference/react', 'useState, useEffect, custom hooks.', 1),
 ('11111111-0000-0000-0000-000000000003', 'Next.js App Router', 'ARTICLE', 'https://nextjs.org/docs/app', 'Layout, page, server/client component.', 2),
 ('11111111-0000-0000-0000-000000000003', 'Bài tập: Todo app', 'EXERCISE', NULL, 'Xây dựng todo app với Next.js.', 3),
 ('11111111-0000-0000-0000-000000000004', 'Dockerfile & image', 'ARTICLE', 'https://docs.docker.com/get-started/', 'Build image, multi-stage build.', 1),
 ('11111111-0000-0000-0000-000000000004', 'Docker Compose', 'ARTICLE', 'https://docs.docker.com/compose/', 'Chạy nhiều container cùng lúc.', 2),
 ('11111111-0000-0000-0000-000000000004', 'GitHub Actions', 'VIDEO', 'https://docs.github.com/actions', 'Workflow, job, matrix build.', 3),
 ('11111111-0000-0000-0000-000000000005', 'Pandas cơ bản', 'ARTICLE', 'https://pandas.pydata.org/docs/', 'DataFrame, xử lý dữ liệu.', 1),
 ('11111111-0000-0000-0000-000000000005', 'scikit-learn pipeline', 'ARTICLE', 'https://scikit-learn.org/stable/', 'Train/test split, model evaluation.', 2);

INSERT INTO roadmaps (id, title, track, description) VALUES
 ('22222222-0000-0000-0000-000000000001', 'Lộ trình Backend Developer', 'Backend', 'Từ lập trình Java cơ bản tới thiết kế hệ thống phân tán.'),
 ('22222222-0000-0000-0000-000000000002', 'Lộ trình DevOps Engineer', 'DevOps', 'Linux, container, CI/CD và vận hành hệ thống.'),
 ('22222222-0000-0000-0000-000000000003', 'Lộ trình Frontend Developer', 'Frontend', 'HTML/CSS, JavaScript, React và Next.js.')
ON CONFLICT DO NOTHING;

INSERT INTO roadmap_items (roadmap_id, title, description, order_index, course_id) VALUES
 ('22222222-0000-0000-0000-000000000001', 'Nắm vững Java core', 'OOP, collection, exception, stream API.', 1, NULL),
 ('22222222-0000-0000-0000-000000000001', 'REST API với Spring Boot', 'Hoàn thành khoá Java Spring Boot căn bản.', 2, '11111111-0000-0000-0000-000000000001'),
 ('22222222-0000-0000-0000-000000000001', 'Cơ sở dữ liệu quan hệ', 'SQL, index, transaction, normalization.', 3, NULL),
 ('22222222-0000-0000-0000-000000000001', 'Docker hoá ứng dụng', 'Đóng gói service bằng Docker.', 4, '11111111-0000-0000-0000-000000000004'),
 ('22222222-0000-0000-0000-000000000001', 'System Design', 'Hoàn thành khoá System Design cho phỏng vấn.', 5, '11111111-0000-0000-0000-000000000002'),
 ('22222222-0000-0000-0000-000000000002', 'Linux & shell', 'Lệnh cơ bản, quyền, process, networking.', 1, NULL),
 ('22222222-0000-0000-0000-000000000002', 'Container', 'Docker & Docker Compose.', 2, '11111111-0000-0000-0000-000000000004'),
 ('22222222-0000-0000-0000-000000000002', 'Kubernetes cơ bản', 'Pod, deployment, service.', 3, NULL),
 ('22222222-0000-0000-0000-000000000003', 'HTML/CSS & JavaScript', 'Nền tảng web.', 1, NULL),
 ('22222222-0000-0000-0000-000000000003', 'React & Next.js', 'Hoàn thành khoá React & Next.js thực chiến.', 2, '11111111-0000-0000-0000-000000000003');
