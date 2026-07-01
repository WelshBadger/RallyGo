import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function fmtDate(str) {
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Blog index (/news) ───────────────────────────────────────────────────────

export function NewsIndexPage() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('news_posts')
      .select('*')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .then(({ data }) => { setPosts(data || []); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-4">
      <div className="h-72 bg-white/5 rounded-2xl animate-pulse" />
      <div className="h-20 bg-white/5 rounded-xl animate-pulse" />
      <div className="h-20 bg-white/5 rounded-xl animate-pulse" />
    </div>
  )

  if (posts.length === 0) return (
    <div className="max-w-2xl mx-auto px-4 py-10 text-center">
      <p className="text-white/35 text-sm">No posts yet.</p>
    </div>
  )

  const [latest, ...older] = posts

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-rl-accent animate-pulse" />
        <span className="text-rl-accent text-[11px] font-semibold uppercase tracking-widest">News &amp; Updates</span>
      </div>

      {/* Latest — featured */}
      <Link to={`/news/${latest.id}`} className="block bg-white/3 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all no-underline group">
        {latest.image_url ? (
          <img src={latest.image_url} alt={latest.title} className="w-full h-56 sm:h-72 object-contain bg-black/20" />
        ) : (
          <div className="h-0.5 w-full bg-gradient-to-r from-rl-accent via-rl-accent/50 to-transparent" />
        )}
        <div className="p-6">
          {latest.published_at && <p className="text-white/30 text-xs mb-3">{fmtDate(latest.published_at)}</p>}
          <h2 className="text-white font-semibold text-xl sm:text-2xl leading-snug mb-2 group-hover:text-rl-accent transition-colors">{latest.title}</h2>
          {latest.excerpt && <p className="text-white/45 text-sm leading-relaxed mb-3">{latest.excerpt}</p>}
          <p className="text-white/35 text-sm leading-relaxed line-clamp-3">{latest.body}</p>
          <p className="text-rl-accent text-xs mt-4">Read more →</p>
        </div>
      </Link>

      {/* Older posts */}
      {older.length > 0 && (
        <div className="space-y-3">
          <p className="text-white/25 text-[11px] uppercase tracking-widest font-medium">Previous posts</p>
          {older.map(post => (
            <Link key={post.id} to={`/news/${post.id}`} className="flex items-stretch gap-0 bg-white/3 border border-white/8 rounded-xl overflow-hidden hover:border-white/18 transition-all no-underline group">
              {post.image_url && (
                <img src={post.image_url} alt={post.title} className="w-24 sm:w-32 object-contain bg-black/20 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0 px-5 py-4">
                {post.published_at && <p className="text-white/25 text-xs mb-1">{fmtDate(post.published_at)}</p>}
                <h3 className="text-white font-medium text-sm leading-snug group-hover:text-rl-accent transition-colors">{post.title}</h3>
                {post.excerpt && <p className="text-white/40 text-xs mt-1 line-clamp-2">{post.excerpt}</p>}
              </div>
              <div className="flex items-center pr-4">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0">
                  <path fillRule="evenodd" d="M8.22 2.97a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06l2.97-2.97H3.75a.75.75 0 010-1.5h7.44L8.22 4.03a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}

// ── Individual post (/news/:id) ───────────────────────────────────────────────

export default function NewsPostPage() {
  const { id } = useParams()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('news_posts').select('*').eq('id', id).single()
      .then(({ data }) => { setPost(data); setLoading(false) })
  }, [id])

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-4">
      <div className="h-64 bg-white/5 rounded-2xl animate-pulse" />
      <div className="h-8 bg-white/5 rounded animate-pulse w-3/4" />
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => <div key={i} className="h-4 bg-white/5 rounded animate-pulse" />)}
      </div>
    </div>
  )

  if (!post) return (
    <div className="max-w-2xl mx-auto px-4 py-10 text-center">
      <p className="text-white/40">Post not found.</p>
      <Link to="/news" className="text-rl-accent text-sm mt-2 inline-block">← Back to news</Link>
    </div>
  )

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Link to="/news" className="text-white/30 hover:text-white/60 text-xs flex items-center gap-1 mb-6 no-underline transition-colors">
        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7h7.44a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z" clipRule="evenodd" />
        </svg>
        All news
      </Link>

      {post.image_url && (
        <div className="rounded-2xl overflow-hidden bg-black/20 mb-8 border border-white/8">
          <img src={post.image_url} alt={post.title} className="w-full max-h-80 object-contain" />
        </div>
      )}

      {post.published_at && <p className="text-white/30 text-xs mb-3">{fmtDate(post.published_at)}</p>}
      <h1 className="text-white font-semibold text-2xl sm:text-3xl leading-snug mb-4">{post.title}</h1>

      {post.excerpt && (
        <p className="text-white/55 text-base leading-relaxed mb-6 border-l-2 border-rl-accent/40 pl-4">{post.excerpt}</p>
      )}

      <div className="text-white/60 text-sm leading-relaxed whitespace-pre-wrap">{post.body}</div>
    </main>
  )
}
