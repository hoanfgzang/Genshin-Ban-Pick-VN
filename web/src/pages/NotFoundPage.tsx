import { Link } from 'react-router'
import { buttonClass } from '@/components/ui/buttonStyles'

export function NotFoundPage() {
  return (
    <div className="panel mx-auto my-12 flex max-w-md flex-col items-center gap-4 px-6 py-10 text-center">
      <span className="text-4xl font-extrabold text-gold-strong">404</span>
      <h1 className="text-xl font-bold">Không tìm thấy trang</h1>
      <p className="text-sm text-muted">Đường dẫn bạn truy cập không tồn tại hoặc đang được phát triển.</p>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Link to="/" className={buttonClass('primary', 'md')}>
          Về trang chủ
        </Link>
        <Link to="/profile" className={buttonClass('secondary', 'md')}>
          Kho nhân vật
        </Link>
      </div>
    </div>
  )
}
