import * as z from 'zod'

// --- Primitives ---

export const safePathSchema = z.string().min(1).refine(
  (s) => !/[\x00-\x1f\x7f]/.test(s),
  'path contains control characters'
)

// --- Connection ---

export const connectionConfigSchema = z.object({
  host: z.string().min(1).regex(/^[a-zA-Z0-9._\-:[\]]+$/, 'Invalid hostname characters'),
  port: z.int().min(1).max(65535),
  username: z.string().min(1).regex(/^[a-zA-Z0-9._\-]+$/, 'Invalid username characters')
})

export type ConnectionConfig = z.infer<typeof connectionConfigSchema>

// --- Settings ---

export const cancelCleanupSchema = z.enum(['remove-partial', 'remove-all'])

export type CancelCleanup = z.infer<typeof cancelCleanupSchema>

export const appSettingsSchema = z.object({
  maxConcurrentTransfers: z.int().min(1).max(10),
  cancelCleanup: cancelCleanupSchema
})

export type AppSettings = z.infer<typeof appSettingsSchema>

// --- Transfer direction ---

export const directionSchema = z.enum(['upload', 'download'])

export type TransferDirection = z.infer<typeof directionSchema>

// --- Transfer conflict batch ---

export const conflictBatchItemSchema = z.object({
  sourcePath: safePathSchema,
  destDir: safePathSchema,
  filename: z.string().min(1)
})

export const conflictBatchInputSchema = z.array(conflictBatchItemSchema)

// --- Skip files ---

export const skipFilesSchema = z.array(z.string()).optional().nullable().transform(v => v ?? undefined)

// --- Error log ---

export const errorLogContentSchema = z.string().min(1).max(1_000_000)
