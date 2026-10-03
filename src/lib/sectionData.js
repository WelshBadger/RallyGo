import { supabase } from './supabase'

// The documents query behind a rally section page. Shared with the rally page,
// which runs it for every section while there's signal so the service worker has
// each section's data cached for opening offline (it caches by exact URL).
export function sectionDocsQuery(rallyId, section) {
  let query = supabase
    .from('rally_documents')
    .select('*')
    .eq('rally_id', rallyId)
    .order('created_at', { ascending: false })
  if (section !== 'documents') query = query.eq('section', section)
  return query
}

export function rallyQuery(rallyId) {
  return supabase.from('rallies').select('*').eq('id', rallyId).single()
}
