import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function fmtDate(str) {
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function NewsPage() {
  const { id } = useParams()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('news_posts')
        .select('*')
        .eq('id', id)
        .single()
      setPost(data)
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="h-64 bg-white/5 rounded-2xl animate-pulse mb-6" />
      <div className="h-8 bg-white/5 rounded animate-pulse mb-3 w-3/4" />
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-white/5 rounded animate-pulse" />)}
      </div>
    </div>
  )

  if (!post) return (
    <div className="max-w-2xl mx-auto px-4 py-10 text-center">
      <p className="text-white/40">Post not found.</p>
      <Link to="/" className="text-rl-accent text-sm mt-2 inline-block">← Back</Link>
    </div>
  )

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <Link to="/" className="text-white/30 hover:text-white/60 text-xs flex items-center gap-1 mb-6 no-underline transition-colors">
        <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
          <path fillRule="evenodd" d="M7.78 12.53a.75.75 0 01-1.06 0L2.47 8.28a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 1.06L4.81 7h7.44a.75.75 0 010 1.5H4.81l2.97 2.97a.75.75 0 010 1.06z" clipRule="evenodd" />
        </svg>
        Back to home
      </Link>

      {post.image_url && (
        <div className="rounded-2xl overflow-hidden bg-black/20 mb-8 border border-white/8">
          <img
            src={post.image_url}
            alt={post.title}
            className="w-full max-h-80 object-contain"
          />
        </div>
      )}

      {post.published_at && (
        <p className="text-white/30 text-xs mb-3">{fmtDate(post.published_at)}</p>
      )}

      <h1 className="text-white font-semibold text-2xl sm:text-3xl leading-snug mb-4">{post.title}</h1>

      {post.excerpt && (
        <p className="text-white/55 text-base leading-relaxed mb-6 border-l-2 border-rl-accent/40 pl-4">{post.excerpt}</p>
      )}

      <div className="text-white/60 text-sm leading-relaxed whitespace-pre-wrap">
        {post.body}
      </div>
    </main>
  )
}
