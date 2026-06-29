import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

function formatDate(str) {
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function NewsAdminPage() {
  const { user } = useAuth()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | post object

  async function load() {
    const { data } = await supabase
      .from('news_posts')
      .select('*')
      .order('created_at', { ascending: false })
    setPosts(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id) {
    if (!confirm('Delete this post?')) return
    const { error } = await supabase.from('news_posts').delete().eq('id', id)
    if (error) { toast.error('Delete failed'); return }
    toast.success('Post deleted')
    load()
  }

  async function handlePublishToggle(post) {
    const isPublished = post.status === 'published'
    const { error } = await supabase
      .from('news_posts')
      .update({
        status: isPublished ? 'draft' : 'published',
        published_at: isPublished ? null : new Date().toISOString(),
      })
      .eq('id', post.id)
    if (error) { toast.error('Update failed'); return }
    toast.success(isPublished ? 'Moved to draft' : 'Published')
    load()
  }

  if (editing !== null) {
    return (
      <PostEditor
        post={editing === 'new' ? null : editing}
        userId={user?.id}
        onSave={() => { setEditing(null); load() }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-white font-semibold text-lg">News Posts</h2>
          <p className="text-white/35 text-sm mt-0.5">{posts.filter(p => p.status === 'published').length} published</p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="rl-btn-primary text-sm px-4 py-2"
        >
          + New post
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 text-white/30 text-sm">No posts yet. Write your first one.</div>
      ) : (
        <div className="space-y-2">
          {posts.map(post => (
            <div key={post.id} className="flex items-center gap-4 bg-white/3 border border-white/8 rounded-xl px-4 py-3.5 hover:border-white/15 transition-all">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    post.status === 'published'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                      : 'bg-white/8 text-white/35 border border-white/10'
                  }`}>
                    {post.status === 'published' ? 'Published' : 'Draft'}
                  </span>
                  {post.published_at && (
                    <span className="text-white/25 text-[10px]">{formatDate(post.published_at)}</span>
                  )}
                </div>
                <p className="text-white text-sm font-medium truncate">{post.title}</p>
                {post.excerpt && <p className="text-white/35 text-xs truncate mt-0.5">{post.excerpt}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handlePublishToggle(post)}
                  className="text-xs text-white/40 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/25 transition-all"
                >
                  {post.status === 'published' ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  onClick={() => setEditing(post)}
                  className="text-xs text-white/40 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/25 transition-all"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(post.id)}
                  className="text-xs text-red-400/60 hover:text-red-400 px-3 py-1.5 rounded-lg border border-white/10 hover:border-red-400/30 transition-all"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PostEditor({ post, userId, onSave, onCancel }) {
  const [title, setTitle] = useState(post?.title || '')
  const [excerpt, setExcerpt] = useState(post?.excerpt || '')
  const [body, setBody] = useState(post?.body || '')
  const [saving, setSaving] = useState(false)

  async function handleSave(publish = false) {
    if (!title.trim() || !body.trim()) { toast.error('Title and body are required'); return }
    setSaving(true)

    const payload = {
      title: title.trim(),
      excerpt: excerpt.trim() || null,
      body: body.trim(),
      updated_at: new Date().toISOString(),
      ...(publish ? { status: 'published', published_at: new Date().toISOString() } : {}),
    }

    let error
    if (post?.id) {
      ;({ error } = await supabase.from('news_posts').update(payload).eq('id', post.id))
    } else {
      ;({ error } = await supabase.from('news_posts').insert({ ...payload, author_id: userId, status: publish ? 'published' : 'draft' }))
    }

    setSaving(false)
    if (error) { toast.error('Save failed'); return }
    toast.success(publish ? 'Published!' : 'Saved as draft')
    onSave()
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onCancel} className="text-white/40 hover:text-white transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M7.78 4.22a.75.75 0 010 1.06L5.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L3.47 8.53a.75.75 0 010-1.06l3.25-3.25a.75.75 0 011.06 0z" />
          </svg>
        </button>
        <h2 className="text-white font-semibold text-lg">{post ? 'Edit post' : 'New post'}</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="rl-label">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Post title"
            className="rl-input text-base"
          />
        </div>

        <div>
          <label className="rl-label">Excerpt <span className="text-white/20 normal-case tracking-normal font-normal">(optional — shown in previews)</span></label>
          <input
            type="text"
            value={excerpt}
            onChange={e => setExcerpt(e.target.value)}
            placeholder="One-line summary"
            className="rl-input"
          />
        </div>

        <div>
          <label className="rl-label">Body</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your post here…"
            rows={12}
            className="rl-input resize-none leading-relaxed"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="rl-btn-ghost px-5 py-2.5 text-sm"
          >
            Save draft
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="rl-btn-primary px-5 py-2.5 text-sm"
          >
            {saving ? 'Saving…' : post?.status === 'published' ? 'Update & publish' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  )
}
