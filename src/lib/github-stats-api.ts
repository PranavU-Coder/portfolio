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

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Java: '#b07219',
  Go: '#00ADD8',
  Rust: '#dea584',
  'C++': '#f34b7d',
  C: '#555555',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Astro: '#ff5a03',
  Vue: '#41b883',
  React: '#61dafb',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Dockerfile: '#384d54',
}

export async function getGitHubStats(username: string): Promise<GitHubStats | null> {
  const token = import.meta.env.GITHUB_TOKEN

  if (!token) {
    console.error('GitHub token not found. Add GITHUB_TOKEN to your .env file.')
    return null
  }

  const query = `
    query($username: String!) {
      user(login: $username) {
        repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC) {
          totalCount
          nodes {
            stargazerCount
            primaryLanguage {
              name
              color
            }
            languages(first: 10) {
              edges {
                size
                node {
                  name
                  color
                }
              }
            }
          }
        }
        contributionsCollection {
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                weekday
                date
              }
            }
          }
        }
      }
    }
  `

  try {
    const response = await fetch(GITHUB_GRAPHQL_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { username },
      }),
      cache: 'no-store',
    })

    if (!response.ok) throw new Error(`GitHub GraphQL API error: ${response.status}`)
    const data = await response.json()

    if (data.errors) {
      console.error('GraphQL errors:', data.errors)
      return null
    }

    const user = data.data.user
    const totalStars = user.repositories.nodes.reduce(
      (acc: number, repo: any) => acc + repo.stargazerCount,
      0
    )

    const languageMap = new Map<string, number>()
    let totalSize = 0

    user.repositories.nodes.forEach((repo: any) => {
      repo.languages.edges.forEach((edge: any) => {
        const current = languageMap.get(edge.node.name) || 0
        languageMap.set(edge.node.name, current + edge.size)
        totalSize += edge.size
      })
    })

    const languageStats = Array.from(languageMap.entries())
      .map(([name, size]) => ({
        name,
        percentage: Math.round((size / totalSize) * 100),
        color: LANGUAGE_COLORS[name] || '#8b949e',
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 5) 

    const dayContributions = new Map<number, number>()
    user.contributionsCollection.contributionCalendar.weeks.forEach((week: any) => {
      week.contributionDays.forEach((day: any) => {
        const weekday = day.weekday
        const current = dayContributions.get(weekday) || 0
        dayContributions.set(weekday, current + day.contributionCount)
      })
    })

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const mostActiveWeekday = Array.from(dayContributions.entries()).sort((a, b) => b[1] - a[1])[0]
    const mostActiveDay = dayNames[mostActiveWeekday[0]]

    return {
      totalRepositories: user.repositories.totalCount,
      totalCommits: user.contributionsCollection.totalCommitContributions,
      totalPullRequests: user.contributionsCollection.totalPullRequestContributions,
      totalIssues: user.contributionsCollection.totalIssueContributions,
      totalStars,
      contributionsLastYear: user.contributionsCollection.contributionCalendar.totalContributions,
      mostActiveDay,
      languageStats,
    }
  } catch (error) {
    console.error('Error fetching GitHub stats:', error)
    return null
  }
}

export async function getContributionCalendar(username: string): Promise<ContributionCalendar | null> {
  const token = import.meta.env.GITHUB_TOKEN

  if (!token) {
    console.error('GitHub token not found. Add GITHUB_TOKEN to your .env file.')
    return null
  }

  const query = `
    query($username: String!) {
      user(login: $username) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                contributionLevel
              }
            }
          }
        }
      }
    }
  `

  try {
    const response = await fetch(GITHUB_GRAPHQL_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { username },
      }),
      cache: 'no-store',
    })

    if (!response.ok) throw new Error(`GitHub GraphQL API error: ${response.status}`)
    const data = await response.json()

    if (data.errors) {
      console.error('GraphQL errors:', data.errors)
      return null
    }

    const calendar = data.data.user.contributionsCollection.contributionCalendar
    const levelMap: Record<string, number> = {
      NONE: 0,
      FIRST_QUARTILE: 1,
      SECOND_QUARTILE: 2,
      THIRD_QUARTILE: 3,
      FOURTH_QUARTILE: 4,
    }

    return {
      totalContributions: calendar.totalContributions,
      weeks: calendar.weeks.map((week: any) => ({
        contributionDays: week.contributionDays.map((day: any) => ({
          date: day.date,
          count: day.contributionCount,
          level: levelMap[day.contributionLevel] || 0,
        })),
      })),
    }
  } catch (error) {
    console.error('Error fetching contribution calendar:', error)
    return null
  }
}