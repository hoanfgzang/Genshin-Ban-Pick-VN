import { Link } from 'react-router'
import { buttonClass } from '@/components/ui/buttonStyles'
import { BRAND } from '@/config/brand'
import { CHARACTERS } from '@/domain/characters'
import { useAuthStore } from '@/features/auth/authStore'
import { cn } from '@/lib/cn'

const PREVIEW = CHARACTERS.filter((c) => c.rarity === 5 && c.element)
  .slice(-12)
  .reverse()

const FEATURES = [
  {
    title: 'Kho nhân vật cá nhân',
    status: 'Sẵn sàng',
    ready: true,
    desc: 'Lưu danh sách nhân vật sở hữu kèm cung mệnh (C0–C6) và level (90/95/100). Hỗ trợ chọn nhanh và nhập/xuất JSON.',
  },
  {
    title: 'Bộ luật & Chế độ chơi',
    status: 'Giai đoạn 2',
    ready: false,
    desc: 'Tùy chọn thứ tự ban/pick, giới hạn thời gian mỗi lượt và quy tắc thi đấu linh hoạt cho từng giải.',
  },
  {
    title: 'Ban/Pick Realtime & Cân bằng',
    status: 'Giai đoạn 3–5',
    ready: false,
    desc: 'Tạo phòng đấu 1v1 tương tác thời gian thực cùng cơ chế tính điểm cân bằng giữa hai tài khoản ngay trong trận.',
  },
]

export function HomePage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="flex flex-col gap-8 py-4">
      <section className="panel relative overflow-hidden border-gold/25 px-6 py-10 text-center sm:px-10 sm:py-14">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
          <img
            src={BRAND.logo}
            alt=""
            className="size-16 drop-shadow-[0_0_24px_rgba(211,188,142,0.35)]"
          />
          <h1 className="text-3xl font-extrabold tracking-wide text-gold-strong sm:text-4xl">
            {BRAND.name}
          </h1>
          <p className="text-base text-muted sm:text-lg">{BRAND.tagline}</p>

          <div className="mt-2 flex flex-wrap justify-center gap-3">
            {user ? (
              <Link to="/profile" className={buttonClass('primary', 'lg')}>
                Mở kho nhân vật
              </Link>
            ) : (
              <>
                <Link to="/login" className={buttonClass('primary', 'lg')}>
                  Bắt đầu ngay
                </Link>
                <Link to="/register" className={buttonClass('secondary', 'lg')}>
                  Đăng ký tài khoản
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="mx-auto mt-10 grid max-w-3xl grid-cols-6 gap-2 sm:grid-cols-12">
          {PREVIEW.map((c) => (
            <div
              key={c.slug}
              title={c.name}
              className="aspect-square overflow-hidden rounded-lg border border-gold/30 bg-gradient-to-br from-r5-from to-r5-to"
            >
              <img src={c.icon} alt={c.name} loading="lazy" className="size-full object-cover" />
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Tính năng chính">
        {FEATURES.map((f) => (
          <article key={f.title} className="panel flex flex-col gap-2.5 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-text">{f.title}</h2>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                  f.ready ? 'bg-success/15 text-success' : 'bg-panel-2 text-muted',
                )}
              >
                {f.status}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted">{f.desc}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
