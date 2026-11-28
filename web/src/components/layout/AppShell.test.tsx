import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { AppShell } from './AppShell'

function renderShell(initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>Home Content</div>} />
          <Route path="/profile" element={<div>Profile Content</div>} />
          <Route path="/rules" element={<div>Rules Content</div>} />
          <Route path="/lobby" element={<div>Lobby Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('components/layout/AppShell', () => {
  it('hiển thị tab hiện tại và nút mở đầy đủ tất cả tab, đóng lại sau khi chuyển trang', async () => {
    const user = userEvent.setup()
    renderShell(['/'])

    const toggleBtn = screen.getByRole('button', { name: /Tất cả tab/i })
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: 'Tất cả tab điều hướng' })).not.toBeInTheDocument()

    await user.click(toggleBtn)

    const collapseBtn = screen.getByRole('button', { name: /Thu gọn/i })
    expect(collapseBtn).toHaveAttribute('aria-expanded', 'true')

    const drawerNav = screen.getByRole('navigation', { name: 'Tất cả tab điều hướng' })
    expect(within(drawerNav).getByRole('link', { name: 'Trang chủ' })).toBeInTheDocument()
    expect(within(drawerNav).getByRole('link', { name: 'Kho nhân vật' })).toBeInTheDocument()
    expect(within(drawerNav).getByRole('link', { name: 'Bộ luật' })).toBeInTheDocument()
    expect(within(drawerNav).getByRole('link', { name: 'Tạo trận' })).toBeInTheDocument()

    await user.click(within(drawerNav).getByRole('link', { name: 'Bộ luật' }))

    expect(screen.getByText('Rules Content')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Tất cả tab điều hướng' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tất cả tab/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('thu gọn thành mini-pill khi cuộn xuống và vẫn mở được đầy đủ tab', async () => {
    const user = userEvent.setup()
    renderShell(['/lobby'])

    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 120, writable: true, configurable: true })
      fireEvent.scroll(window)
    })

    const pillToggle = screen.getByRole('button', { name: 'Hiển thị đầy đủ tất cả tab' })
    expect(pillToggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(pillToggle)

    expect(screen.getByRole('navigation', { name: 'Tất cả tab điều hướng' })).toBeInTheDocument()
  })
})
