export interface GitHubStats {
  totalRepositories: number
  totalCommits: number
  totalPullRequests: number
  totalIssues: number
  totalStars: number
  contributionsLastYear: number
  mostActiveDay: string
  languageStats: Array<{
    name: string
    percentage: number
    color: string
  }>
}

export interface ContributionDay {
  date: string
  count: number
  level: number
}

export interface ContributionCalendar {
  totalContributions: number
  weeks: Array<{
    contributionDays: ContributionDay[]
  }>
}

const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql'

const IGNORED_LANGUAGES = new Set([
  'Markdown',
  'TeX',
  'Rich Text Format',
  'Jupyter Notebook',
])

// throw out nix

const LANGUAGE_EXCLUDED_REPOS = new Set(['nixpkgs'])
const MAX_LANGUAGES = 5
const FALLBACK_COLOR = '#8b949e'

const MAX_REPO_PAGES = 10

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const LEVEL_MAP: Record<string, number> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
}

interface RepoNode {
  name: string
  stargazerCount: number
  languages: {
    edges: Array<{ size: number; node: { name: string; color: string | null } }>
  }
}

interface RawCalendar {
  totalContributions: number
  weeks: Array<{
    contributionDays: Array<{
      date: string
      weekday: number
      contributionCount: number
      contributionLevel: string
    }>
  }>
}

interface YearTotals {
  totalCommitContributions: number
  totalPullRequestContributions: number
  totalIssueContributions: number
}

interface GitHubData {
  stats: GitHubStats
  calendar: ContributionCalendar
}

async function graphql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const token = import.meta.env.GITHUB_TOKEN
  if (!token)
    throw new Error(
      'GitHub token not found. Add GITHUB_TOKEN to your .env file.',
    )

  const response = await fetch(GITHUB_GRAPHQL_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!response.ok)
    throw new Error(`GitHub GraphQL API error: ${response.status}`)

  const data = await response.json()
  if (data.errors)
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`)
  return data.data as T
}

async function getOwnRepos(username: string) {
  const query = `
    query($username: String!, $after: String) {
      user(login: $username) {
        repositories(
          first: 100
          after: $after
          ownerAffiliations: OWNER
          privacy: PUBLIC
        ) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            name
            stargazerCount
            languages(first: 100, orderBy: { field: SIZE, direction: DESC }) {
              edges { size node { name color } }
            }
          }
        }
      }
    }
  `
  type Page = {
    user: {
      repositories: {
        totalCount: number
        pageInfo: { hasNextPage: boolean; endCursor: string | null }
        nodes: RepoNode[]
      }
    }
  }

  const repos: RepoNode[] = []
  let totalCount = 0
  let after: string | null = null
  for (let page = 0; page < MAX_REPO_PAGES; page++) {
    const data: Page = await graphql<Page>(query, { username, after })
    const { repositories } = data.user
    totalCount = repositories.totalCount
    repos.push(...repositories.nodes)
    if (!repositories.pageInfo.hasNextPage) break
    after = repositories.pageInfo.endCursor
  }
  return { totalCount, repos }
}

async function getProfile(username: string) {
  const query = `
    query($username: String!) {
      user(login: $username) {
        createdAt
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                weekday
                contributionCount
                contributionLevel
              }
            }
          }
        }
      }
    }
  `
  const data = await graphql<{
    user: {
      createdAt: string
      contributionsCollection: { contributionCalendar: RawCalendar }
    }
  }>(query, { username })
  return {
    createdAt: new Date(data.user.createdAt),
    calendar: data.user.contributionsCollection.contributionCalendar,
  }
}

async function getAllTimeTotals(username: string, createdAt: Date) {
  const now = new Date()
  const years: number[] = []
  for (let y = createdAt.getUTCFullYear(); y <= now.getUTCFullYear(); y++)
    years.push(y)

  const fields = years
    .map((year) => {
      const from =
        year === createdAt.getUTCFullYear()
          ? createdAt.toISOString()
          : `${year}-01-01T00:00:00Z`
      const to =
        year === now.getUTCFullYear()
          ? now.toISOString()
          : `${year}-12-31T23:59:59Z`
      return `y${year}: contributionsCollection(from: "${from}", to: "${to}") {
        totalCommitContributions
        totalPullRequestContributions
        totalIssueContributions
      }`
    })
    .join('\n')

  const data = await graphql<{ user: Record<string, YearTotals> }>(
    `query($username: String!) { user(login: $username) { ${fields} } }`,
    { username },
  )

  const totals = { commits: 0, pullRequests: 0, issues: 0 }
  for (const year of Object.values(data.user)) {
    totals.commits += year.totalCommitContributions
    totals.pullRequests += year.totalPullRequestContributions
    totals.issues += year.totalIssueContributions
  }
  return totals
}

function aggregateLanguages(repos: RepoNode[]) {
  const totals = new Map<string, { bytes: number; color: string | null }>()
  for (const repo of repos) {
    if (LANGUAGE_EXCLUDED_REPOS.has(repo.name)) continue
    for (const { size, node } of repo.languages.edges) {
      if (IGNORED_LANGUAGES.has(node.name)) continue
      const entry = totals.get(node.name) ?? { bytes: 0, color: node.color }
      entry.bytes += size
      totals.set(node.name, entry)
    }
  }

  const sorted = [...totals].sort((a, b) => b[1].bytes - a[1].bytes)
  const total = sorted.reduce((sum, [, { bytes }]) => sum + bytes, 0)
  if (!total) return []

  // ensuring small languages don't round down to 0%.
  const percent = (bytes: number) => Math.round((bytes / total) * 1000) / 10
  const shares = sorted.slice(0, MAX_LANGUAGES).map(([name, entry]) => ({
    name,
    percentage: percent(entry.bytes),
    color: entry.color ?? FALLBACK_COLOR,
  }))
  const rest = sorted
    .slice(MAX_LANGUAGES)
    .reduce((sum, [, { bytes }]) => sum + bytes, 0)
  if (rest)
    shares.push({
      name: 'Other',
      percentage: percent(rest),
      color: FALLBACK_COLOR,
    })
  return shares
}

function mostActiveDay(calendar: RawCalendar) {
  const perWeekday = new Array<number>(7).fill(0)
  for (const week of calendar.weeks)
    for (const day of week.contributionDays)
      perWeekday[day.weekday] += day.contributionCount
  return DAY_NAMES[perWeekday.indexOf(Math.max(...perWeekday))]
}

async function fetchGitHubData(username: string): Promise<GitHubData> {
  const [{ totalCount, repos }, profile] = await Promise.all([
    getOwnRepos(username),
    getProfile(username),
  ])
  const totals = await getAllTimeTotals(username, profile.createdAt)
  const { calendar } = profile

  return {
    stats: {
      totalRepositories: totalCount,
      totalCommits: totals.commits,
      totalPullRequests: totals.pullRequests,
      totalIssues: totals.issues,
      totalStars: repos.reduce((sum, repo) => sum + repo.stargazerCount, 0),
      contributionsLastYear: calendar.totalContributions,
      mostActiveDay: mostActiveDay(calendar),
      languageStats: aggregateLanguages(repos),
    },
    calendar: {
      totalContributions: calendar.totalContributions,
      weeks: calendar.weeks.map((week) => ({
        contributionDays: week.contributionDays.map((day) => ({
          date: day.date,
          count: day.contributionCount,
          level: LEVEL_MAP[day.contributionLevel] ?? 0,
        })),
      })),
    },
  }
}

const cache = new Map<string, Promise<GitHubData | null>>()

function getGitHubData(username: string) {
  let data = cache.get(username)
  if (!data) {
    data = fetchGitHubData(username).catch((error) => {
      console.error('Error fetching GitHub data:', error)
      return null
    })
    cache.set(username, data)
  }
  return data
}

export async function getGitHubStats(
  username: string,
): Promise<GitHubStats | null> {
  return (await getGitHubData(username))?.stats ?? null
}

export async function getContributionCalendar(
  username: string,
): Promise<ContributionCalendar | null> {
  return (await getGitHubData(username))?.calendar ?? null
}
