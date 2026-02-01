import fs from 'node:fs/promises'
import path from 'node:path'
const CACHE_DIR = '.astro/github-cache'
const CACHE_DURATION = 1000 * 60 * 60 

interface CacheEntry<T> {
  data: T
  timestamp: number
}

async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true })
  } catch (error) {}
}

export async function getCachedData<T>(
  key: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  await ensureCacheDir()

  const cacheFile = path.join(CACHE_DIR, `${key}.json`)

  try {
    const cached = await fs.readFile(cacheFile, 'utf-8')
    const entry: CacheEntry<T> = JSON.parse(cached)

    if (Date.now() - entry.timestamp < CACHE_DURATION) {
      console.log(`Using cached data for: ${key}`)
      return entry.data
    }
  } catch (error) {}

  console.log(`Fetching fresh GitHub data for: ${key}`)
  const data = await fetchFn()

  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
  }

  try {
    await fs.writeFile(cacheFile, JSON.stringify(entry, null, 2))
  } catch (error) {
    console.error('Failed to write cache:', error)
  }

  return data
}