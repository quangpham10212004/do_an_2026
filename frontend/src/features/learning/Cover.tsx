/** Ảnh bìa khoá học / roadmap / bài viết; không có ảnh thì hiện nền trung tính để bố cục không nhảy. */
export default function Cover({ src, alt = "", className = "" }: { src?: string | null; alt?: string; className?: string }) {
  return (
    <div className={`overflow-hidden bg-surface-sunken ${className}`}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh tĩnh/seed hoặc URL do admin nhập, không qua next/image
        <img src={src} alt={alt} loading="lazy" className="size-full object-cover" />
      )}
    </div>
  );
}

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} phút`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
}
