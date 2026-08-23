import { defineConfig } from '@playwright/test'

// E2E 只扫描 tests/e2e，workers=1：应用实例占用本地数据目录与端口，
// 并行会互相干扰；限定范围也避免扫描到仓库根下其它产物目录。
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 200_000,
  workers: 1,
  retries: 0,
})
