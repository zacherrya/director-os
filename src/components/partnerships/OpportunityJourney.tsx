import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { activityEntry, completeAction, journeyFor, localDate, health, type Opportunity, type Brand, type Activity } from '../../lib/partnerships'

export function OpportunityJourney({ opportunity: o, brand }: { opportunity: Opportunity; brand?: Brand }) {
  const update = useAppStore(s => s.updateOpportunity)
  const [channel, setChannel] = useState<Activity['channel']>('Notes')
  const [note, setNote] = useState('')
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState('')
  const journey = journeyFor(o)
  const current = journey.find(s => !s.completedAt)
  const activity = [...(o.activity ?? [])].sort((a,b) => b.at.localeCompare(a.at))
  function patch(p: Partial<Opportunity>) { update(o.id, p) }
  function log() {
    if (!note.trim()) return
    patch({activity:[...(o.activity ?? []),activityEntry(note.trim(),channel)]})
    setNote(''); setNotice('Activity saved.')
  }
  function createDraft() {
    const greeting = brand?.contactName ? `Hi ${brand.contactName},` : `Hi ${brand?.name ?? 'team'},`
    const subject = o.title ? `“${o.title}”` : 'a potential collaboration'
    setDraft(`${greeting}\n\n${o.stage === 'Pitched' ? `I wanted to follow up on ${subject} and see whether it could be a fit for your team.` : `I’d love to explore ${subject} with ${brand?.name ?? 'your brand'}.`}${o.concept ? `\n\nThe idea: ${o.concept}` : ''}${o.fit ? `\n\n${o.fit}` : ''}\n\nWould you be open to discussing the next steps?\n\nThank you!`)
    setNotice('Draft prepared from your saved details. Review before sending.')
  }
  const inputClass = 'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px] text-ink'
  return <div className="ow-panel-tools">
    <div className="ow-panel-buttons">
      <button disabled={!o.nextAction && !current} onClick={() => { patch(completeAction(o)); setNotice('Completed. Your next step is ready.') }}>✓ Mark complete</button>
      <button onClick={() => { patch({nextActionDate:localDate(1),activity:[...(o.activity ?? []),activityEntry('Snoozed next action until tomorrow')]}); setNotice('Moved to tomorrow.') }}>Snooze to tomorrow</button>
    </div>
    <div role="status" className="mb-3 text-[11px] text-gold">{notice}</div>
    <div className="ow-recommendation"><h3>Director Recommendation</h3><p>{o.stage === 'Pitched' ? 'You’re waiting on a reply. Check your channels before following up.' : health(o) === 'Stalled' ? 'This next step is more than a week overdue. Revisit the plan and choose a realistic deadline.' : o.nextAction ? `Next move: ${o.nextAction}.` : 'Give this relationship a clear next step and a date.'}</p><button className="text-[11px] font-medium text-gold" onClick={createDraft}>Generate message draft ↗</button><p className="mt-2 !mb-0 !text-[10px] text-ink-faint">Drafted from saved details. Channels are not synced.</p>
      {draft && <div className="mt-3"><label className="mb-2 block text-[11px]" htmlFor="opportunity-message">Edit message</label><textarea id="opportunity-message" className={inputClass} rows={8} value={draft} onChange={e => setDraft(e.target.value)} /><div className="ow-panel-buttons">{brand?.contactEmail && <a href={`mailto:${encodeURIComponent(brand.contactEmail)}?subject=${encodeURIComponent(o.title || `Collaboration with ${brand.name}`)}&body=${encodeURIComponent(draft)}`}>Open email draft</a>}<button onClick={() => {patch({activity:[...(o.activity ?? []),activityEntry(`Message draft saved (not sent):\n${draft}`)]});setNotice('Draft saved in the timeline.')}}>Save draft</button></div><p className="!text-[10px] text-ink-faint">{brand?.contactEmail ? 'Send in your email app, then log the sent email below.' : 'Add a contact email below to open this draft in your email app.'}</p></div>}
    </div>
    <h3>Journey</h3><ol className="ow-journey">{journey.map(s => <li className={s.completedAt ? 'done' : s.id === current?.id ? 'current' : ''} key={s.id}><span>{s.completedAt ? '✓' : s.id === current?.id ? '→' : '○'}</span><span>{s.id === current?.id && o.nextAction ? o.nextAction : s.label}</span></li>)}</ol>
    <h3>Communication timeline</h3><p className="mb-3 text-[10px] text-ink-faint">Email · Instagram · LinkedIn · Notes — manually logged</p>
    {activity.length ? <ol className="ow-timeline">{activity.map(a => <li key={a.id}><small>{new Date(a.at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})} · {a.channel}</small><p>{a.text}</p></li>)}</ol> : <p className="mb-4 text-[11px] text-ink-faint">No activity logged yet. Add the last conversation to keep the context together.</p>}
    <label className="mb-1 block text-[11px]" htmlFor="activity-channel">Channel</label><select id="activity-channel" className={inputClass} value={channel} onChange={e => setChannel(e.target.value as Activity['channel'])}>{['Email','Instagram','LinkedIn','Notes'].map(c => <option key={c}>{c}</option>)}</select>
    <label htmlFor="activity-note" className="mt-3 mb-1 block text-[11px]">What happened?</label><textarea id="activity-note" className={inputClass} rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Brand replied and asked for a concept…" /><div className="ow-panel-buttons"><button disabled={!note.trim()} onClick={log}>Log activity</button></div>
  </div>
}
