-- Bỏ Khoá học và Lộ trình khỏi learning-service (chỉ còn Blog). Bảng con xoá trước bảng cha.
-- Không sửa db/init, V1, V3: chúng vẫn tạo/sửa các bảng này trên CSDL mới, rồi migration này xoá.
DROP TABLE IF EXISTS roadmap_item_progress;
DROP TABLE IF EXISTS roadmap_items;
DROP TABLE IF EXISTS roadmaps;
DROP TABLE IF EXISTS material_completions;
DROP TABLE IF EXISTS course_progress;
DROP TABLE IF EXISTS course_enrollments;
DROP TABLE IF EXISTS course_materials;
DROP TABLE IF EXISTS courses;
