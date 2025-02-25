import { compress as brotli } from 'https://deno.land/x/brotli@v0.1.4/mod.ts'
import { gzip, deflate } from 'https://deno.land/x/denoflate@1.2.1/mod.ts'
import { Accepts } from 'https://deno.land/x/accepts@2.1.1/mod.ts'
import { readAll } from 'https://deno.land/std@0.108.0/io/util.ts'

const funcs = {
  br: brotli,
  gzip: (body: Uint8Array) => gzip(body, undefined),
  deflate: (body: Uint8Array) => deflate(body, undefined)
}

/**
 * Supported compression algorithms
 */
type Compression = 'gzip' | 'br' | 'deflate'

export type CompressionOptions = {
  /**
   * Path to file
   */
  path: string
  /**
   * Compression algorithms (gzip, brotli, deflate). The first is used if all are accepted by the client
   */
  compression: [Compression] | [Compression, Compression] | [Compression, Compression, Compression]
}

/**
 * HTTP Compression middleware.
 * @param {CompressionOptions} opts
 *
 * @example
 * ```ts
 *import { serve } from 'https://deno.land/std@0.108.0/http/server.ts'
 *import { compression } from 'https://deno.land/x/compression/brotli.ts'
 *
 *const s = serve({ port: 3000 })
 *
 *for await (const req of s) {
 *  await compression({
 *    path: 'README.md',
 *    compression: ['gzip', 'deflate']
 *  })(req)
 *}
 * ```
 */
export const compression =
  (opts: CompressionOptions) =>
  async (req: Request): Promise<Response> => {
    const acceptHeader = req.headers.get('Accept-Encoding')

    const accepts = new Accepts(req.headers)

    const encodings = accepts.encodings()

    const file = await Deno.open(opts.path)

    const buf = await readAll(file)
    file.close()

    if (!acceptHeader || acceptHeader === 'identity' || (Array.isArray(encodings) && encodings[0] === 'identity')) {
      return new Response(buf, {
        status: 200,
        headers: new Headers({
          'Content-Encoding': 'identity'
        })
      })
    } else if (acceptHeader === '*') {
      const preferredAlgo = opts.compression[0]

      const compressed = funcs[preferredAlgo](buf)

      return new Response(compressed, {
        headers: new Headers({
          'Content-Encoding': preferredAlgo
        }),
        status: 200
      })
    } else {
      if (Array.isArray(encodings)) {
        let compressed: Uint8Array = buf
        const encs: string[] = []

        for (let enc of encodings.filter((x) => x !== 'identity')) {
          if (enc === 'brotli') enc = 'br'

          if (Object.keys(funcs).includes(enc as string)) {
            compressed = funcs[enc as Compression](compressed)
            encs.push(enc)
          }
        }

        return new Response(compressed, {
          headers: new Headers({
            'Content-Encoding': encs.join(', ')
          })
        })
      } else {
        return Object.keys(funcs).includes(encodings as string)
          ? new Response(funcs[encodings as Compression](buf), {
              headers: new Headers({
                'Content-Encoding': encodings as string
              })
            })
          : new Response('Not Acceptable', {
              status: 406
            })
      }
    }
  }
