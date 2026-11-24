import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/toast'
import type { RuleSet } from '@/domain/ruleset'
import { errorMessage, useAuthStore } from '@/features/auth/authStore'
import { RuleSetEditor } from '@/features/rules/RuleSetEditor'
import { RuleSetViewer } from '@/features/rules/RuleSetViewer'
import { cn } from '@/lib/cn'
import { rulesetService } from '@/services'

export function RulesPage() {
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const [rulesets, setRulesets] = useState<RuleSet[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ open: boolean; target: RuleSet | null }>({
    open: false,
    target: null,
  })

  useEffect(() => {
    let mounted = true
    void rulesetService
      .list(false)
      .then((list) => {
        if (!mounted) return
        setRulesets(list)
        setSelectedId((prev) => prev ?? list[0]?.id ?? null)
      })
      .catch((err) => {
        if (mounted) toast.error(errorMessage(err))
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  if (loading) return <FullPageSpinner label="Đang tải danh sách bộ luật…" />

  const selected = rulesets.find((r) => r.id === selectedId) ?? rulesets[0] ?? null

  const handleSaved = async (saved: RuleSet) => {
    const fresh = await rulesetService.list(false)
    setRulesets(fresh)
    setSelectedId(saved.id)
    setEditing({ open: false, target: null })
  }

  const handleDelete = async (rs: RuleSet) => {
    if (!window.confirm(`Xóa bộ luật "${rs.name}"?`)) return
    try {
      await rulesetService.remove(rs.id)
      const fresh = await rulesetService.list(false)
      setRulesets(fresh)
      setSelectedId(fresh[0]?.id ?? null)
      toast.success('Đã xóa bộ luật.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gold-strong">Bộ luật & Hệ thống Cost</h1>
          <p className="text-sm text-muted">
            Xem thứ tự Ban/Pick, bảng Cost cân bằng nhân vật/vũ khí và quy tắc tính điểm từng bộ luật.
          </p>
        </div>

        {isAdmin && !editing.open && (
          <div className="flex flex-wrap gap-2">
            {selected && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditing({ open: true, target: selected })}
                >
                  Chỉnh sửa luật này
                </Button>
                {rulesets.length > 1 && (
                  <Button size="sm" variant="danger" onClick={() => handleDelete(selected)}>
                    Xóa luật
                  </Button>
                )}
              </>
            )}
            <Button
              size="sm"
              variant="primary"
              onClick={() => setEditing({ open: true, target: null })}
            >
              + Tạo bộ luật mới
            </Button>
          </div>
        )}
      </div>

      {!editing.open && rulesets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rulesets.map((rs) => (
            <button
              key={rs.id}
              type="button"
              onClick={() => setSelectedId(rs.id)}
              className={cn(
                'cursor-pointer rounded-lg border px-3.5 py-2 text-left text-sm transition',
                rs.id === selected?.id
                  ? 'border-gold bg-gold/15 font-semibold text-gold-strong'
                  : 'border-line bg-panel text-muted hover:border-gold/40 hover:text-text',
              )}
            >
              <span>{rs.name}</span>
              {rs.isDefault && (
                <span className="ml-2 rounded bg-black/30 px-1.5 py-0.5 text-[10px]">Mặc định</span>
              )}
            </button>
          ))}
        </div>
      )}

      {editing.open ? (
        <RuleSetEditor
          initial={editing.target}
          onCancel={() => setEditing({ open: false, target: null })}
          onSaved={handleSaved}
        />
      ) : selected ? (
        <RuleSetViewer ruleset={selected} />
      ) : (
        <div className="panel p-8 text-center text-muted">Chưa có bộ luật nào trong hệ thống.</div>
      )}
    </div>
  )
}
