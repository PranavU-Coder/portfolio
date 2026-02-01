import type { IconMap, SocialLink, Site } from '@/types'

export const SITE: Site = {
  title: 'PranavU-Coder',
  description: '19m, indie-dev, prog-metal and rap enjoyer, love goth culture.',
  href: 'https://pranavu.dev/',
  author: 'PranavU',
  locale: 'en-US',
  featuredPostCount: 2,
  postsPerPage: 3,
}

export const NAV_LINKS: SocialLink[] = [
  {
    href: '/blog',
    label: 'blog',
  },
  {
    href: '/about',
    label: 'about',
  },
]

export const SOCIAL_LINKS: SocialLink[] = [
  {
    href: 'https://github.com/PranavU-Coder',
    label: 'GitHub',
  },
  {
    href: 'mailto:pranavu8406@gmail.com',
    label: 'Email',
  },
  {
    href: '/rss.xml',
    label: 'RSS',
  },
]

export const ICON_MAP: IconMap = {
  Website: 'lucide:globe',
  GitHub: 'lucide:github',
  LinkedIn: 'lucide:linkedin',
  Twitter: 'lucide:twitter',
  Email: 'lucide:mail',
  RSS: 'lucide:rss',
}
