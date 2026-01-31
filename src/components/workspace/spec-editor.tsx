'use client'

// ============================================================================
// Spec Editor
// Markdown editor for spec.md content
// ============================================================================

import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { FileCode2, Loader2, Check } from 'lucide-react'

interface SpecEditorProps {
	content: string
	onChange: (content: string) => void
	isSaving?: boolean
}

export function SpecEditor({ content, onChange, isSaving }: SpecEditorProps) {
	const lineCount = content.split('\n').length
	const wordCount = content.trim().split(/\s+/).filter(Boolean).length

	return (
		<div className='h-full flex flex-col bg-zinc-950'>
			{/* Header */}
			<div className='flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900'>
				<div className='flex items-center gap-2'>
					<FileCode2 className='h-4 w-4 text-zinc-500' />
					<span className='text-sm font-medium text-zinc-300'>spec.md</span>
					{isSaving ? (
						<Loader2 className='h-3 w-3 animate-spin text-zinc-500' />
					) : (
						<Check className='h-3 w-3 text-green-500' />
					)}
				</div>
				<div className='flex items-center gap-2'>
					<Badge
						variant='outline'
						className='text-xs bg-zinc-800 border-zinc-700 text-zinc-400'
					>
						{lineCount} lines
					</Badge>
					<Badge
						variant='outline'
						className='text-xs bg-zinc-800 border-zinc-700 text-zinc-400'
					>
						{wordCount} words
					</Badge>
				</div>
			</div>

			{/* Editor */}
			<div className='flex-1 p-4'>
				<Textarea
					value={content}
					onChange={(e) => onChange(e.target.value)}
					placeholder="Feature Specification. Type your requirements here manually, OR chat with Gemini to draft them for you. Once you have a spec, click 'Create Plan' to begin."
					className={`
            h-full w-full resize-none
            bg-zinc-950 border-zinc-800
            text-zinc-200 placeholder:text-zinc-600
            font-mono text-sm leading-relaxed
            focus-visible:ring-1 focus-visible:ring-zinc-700
          `}
				/>
			</div>
		</div>
	)
}
