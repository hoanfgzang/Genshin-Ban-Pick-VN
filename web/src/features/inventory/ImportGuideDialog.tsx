import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { toast } from '@/components/ui/toast'

const HOYOLAB_EXPORT_SCRIPT = [
  '(() => {',
  '  const toSlug = (name) =>',
  '    name',
  "      .normalize('NFD')",
  "      .replace(/[\\u0300-\\u036f]/g, '')",
  '      .toLowerCase()',
  "      .replace(/[^a-z0-9]+/g, '-')",
  "      .replace(/^-+|-+$/g, '');",
  '',
  '  const rawEntries = [];',
  '',
  "  document.querySelectorAll('.main-container .role-medium').forEach((card) => {",
  "    const name = card.querySelector('.name')?.textContent.trim();",
  '    if (!name) return;',
  '',
  "    const levelText = card.querySelector('.level')?.textContent.trim() || '';",
  "    const rawLevel = parseInt(levelText.replace(/\\D+/g, ''), 10) || 1;",
  '    const level = rawLevel >= 100 ? 100 : rawLevel >= 95 ? 95 : 90;',
  '',
  "    const fateText = card.querySelector('.fate-level')?.textContent.trim() || '0';",
  '    const rawConstellation = parseInt(fateText, 10) || 0;',
  '    const constellation = Math.max(0, Math.min(6, rawConstellation));',
  '',
  '    const slug = toSlug(name);',
  '',
  '    // Xử lý riêng nếu HoYoLAB hiển thị là "Traveler", "Nhà Lữ Hành", "Aether" hoặc "Lumine"',
  "    if (slug === 'traveler' || slug === 'nha-lu-hanh') {",
  "      rawEntries.push(['traveler', { slug: 'traveler', constellation, level }]);",
  "    } else if (slug === 'aether') {",
  "      rawEntries.push(['traveler-boy', { slug: 'traveler-boy', constellation, level }]);",
  "    } else if (slug === 'lumine') {",
  "      rawEntries.push(['traveler-girl', { slug: 'traveler-girl', constellation, level }]);",
  '    } else {',
  '      rawEntries.push([slug, { slug, constellation, level }]);',
  '    }',
  '  });',
  '',
  '  // Sắp xếp theo thứ tự bảng chữ cái (a -> z)',
  '  rawEntries.sort(([a], [b]) => a.localeCompare(b));',
  '',
  '  const characters = Object.fromEntries(rawEntries);',
  '',
  '  const result = {',
  '    version: 1,',
  '    characters,',
  "    updatedAt: new Date().toISOString().replace('Z', '000')",
  '  };',
  '',
  '  const jsonString = JSON.stringify(result, null, 2);',
  '',
  '  // Tạo Blob và kích hoạt tải file JSON',
  "  const blob = new Blob([jsonString], { type: 'application/json' });",
  '  const url = URL.createObjectURL(blob);',
  "  const a = document.createElement('a');",
  "  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD",
  '',
  '  a.href = url;',
  '  a.download = `genshin-characters-${dateStr}.json`;',
  '  document.body.appendChild(a);',
  '  a.click();',
  '',
  '  // Dọn dẹp bộ nhớ sau khi tải',
  '  document.body.removeChild(a);',
  '  URL.revokeObjectURL(url);',
  '',
  '  console.log(`✅ Đã lấy ${Object.keys(characters).length} nhân vật và tải xuống file ${a.download}!`);',
  '  return result;',
  '})();',
].join('\n')

interface ImportGuideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenImport?: () => void
}

export function ImportGuideDialog({ open, onOpenChange, onOpenImport }: ImportGuideDialogProps) {
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(HOYOLAB_EXPORT_SCRIPT)
      setCopied(true)
      toast.success('Đã sao chép đoạn code vào clipboard.')
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current)
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false)
        copyTimerRef.current = null
      }, 2000)
    } catch {
      toast.error('Không thể tự động sao chép. Vui lòng bôi đen và copy thủ công.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Hướng dẫn nhập nhanh kho nhân vật"
      className="max-w-3xl"
      footer={
        <>
          {onOpenImport && (
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false)
                onOpenImport()
              }}
            >
              Nhập JSON
            </Button>
          )}
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </>
      }
    >
      <ol className="space-y-4 text-sm leading-relaxed text-text/95">
        <li className="space-y-2">
          <p>
            <strong className="text-gold-strong">Bước 1:</strong> Để nhập nhanh kho nhân vật của bạn, vui lòng truy
            cập vào trang{' '}
            <a
              href="https://www.hoyolab.com/"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-hydro underline hover:text-gold-strong"
            >
              HoYoLAB
            </a>
            , login tài khoản và sau đó vào <strong>Tất cả nhân vật</strong> như hình dưới
          </p>
          <a
            href="/demo/1.png"
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-lg border border-line bg-bg/60 transition hover:border-gold/60"
          >
            <img
              src="/demo/1.png"
              alt="Hướng dẫn vào mục Tất cả nhân vật trên HoYoLAB"
              loading="lazy"
              className="w-full object-contain"
            />
          </a>
        </li>

        <li className="space-y-2">
          <p>
            <strong className="text-gold-strong">Bước 2:</strong> Bấm <kbd className="rounded border border-line bg-bg px-1.5 py-0.5 text-xs font-semibold">F12</kbd>, hoặc chuột phải chọn{' '}
            <strong>&quot;Kiểm tra&quot; (Inspector)</strong> rồi vào phần <strong>Console</strong>, như hình dưới
          </p>
          <a
            href="/demo/2.png"
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-lg border border-line bg-bg/60 transition hover:border-gold/60"
          >
            <img
              src="/demo/2.png"
              alt="Hướng dẫn mở tab Console trong Inspector"
              loading="lazy"
              className="w-full object-contain"
            />
          </a>
        </li>

        <li className="space-y-2">
          <p>
            <strong className="text-gold-strong">Bước 3:</strong> Copy đoạn Code sau và paste vào trong Console
          </p>
          <div className="overflow-hidden rounded-lg border border-line bg-bg/80">
            <div className="flex items-center justify-between border-b border-line/80 bg-panel-2/70 px-3 py-1.5">
              <span className="font-mono text-xs text-muted">Console JavaScript</span>
              <Button size="sm" variant="secondary" onClick={handleCopyCode}>
                {copied ? 'Đã sao chép ✓' : 'Copy code'}
              </Button>
            </div>
            <pre className="max-h-72 overflow-auto p-3 font-mono text-xs leading-relaxed text-text">
              <code>{HOYOLAB_EXPORT_SCRIPT}</code>
            </pre>
          </div>
        </li>

        <li>
          <p>
            <strong className="text-gold-strong">Bước 4:</strong> Máy sẽ tự Download 1 file{' '}
            <code className="rounded bg-bg px-1.5 py-0.5 text-xs text-gold-strong">&quot;*.json&quot;</code>, về lại kho nhân vật
            và chọn <strong>Nhập JSON</strong> rồi chọn file vừa tải.
          </p>
        </li>
      </ol>
    </Dialog>
  )
}
