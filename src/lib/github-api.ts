export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  homepage: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  topics: string[]
  created_at: string
  updated_at: string
  pushed_at: string
  fork: boolean 
}

export async function getGitHubRepos(username: string, excludedRepos: string[] = []): Promise<GitHubRepo[]> {
  try {
    const response = await fetch(
      `https://api.github.com/users/${username}/repos?sort=updated&per_page=100`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${import.meta.env.GITHUB_TOKEN}`,  
        },
      }
    )
    
    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`)  
    const repos: GitHubRepo[] = await response.json()
    return repos
      .filter((repo) => !repo.fork) 
      .filter((repo) => !excludedRepos.includes(repo.name))  
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
  } catch (error) {
    console.error('Error fetching GitHub repos:', error)
    return []
  }
}