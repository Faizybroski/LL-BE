import { Request, Response, NextFunction } from 'express'
import { generateTermsPdfBuffer } from '../../services/pdf.service'

export async function termsPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const buffer = await generateTermsPdfBuffer()
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="logical-links-terms-and-conditions.pdf"')
    res.send(buffer)
  } catch (err) {
    next(err)
  }
}
