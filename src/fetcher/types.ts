import { z } from 'zod';

/**
 * Schema for a single TED notice from the search endpoint.
 * Field names are TED eForms field IDs — all optional except ND (dedup key).
 * Source: live-tested against api.ted.europa.eu/v3/notices/search (2026-05-06)
 */
export const RawNoticeSchema = z.object({
  ND: z.string(),                                              // e.g. "582-2026" — dedup key
  'publication-number': z.string().optional(),
  PD: z.string().optional(),                                   // "2026-01-02+01:00"
  TI: z.record(z.string()).optional(),                         // {deu: "...", eng: "..."}
  PC: z.array(z.string()).optional(),                          // ["79822500", "79340000"]
  CY: z.array(z.string()).optional(),                          // ["DEU"]
  'notice-type': z.string().optional(),                        // "cn-standard" | "can-standard" | ...
  'buyer-name': z.record(z.array(z.string())).optional(),      // {deu: ["BWI GmbH"]}
  'description-lot': z.record(z.array(z.string())).optional(),
  'title-lot': z.record(z.array(z.string())).optional(),
  'BT-27-Lot': z.array(z.string()).optional(),                 // ["1600000.00"] decimal strings
  'BT-27-Lot-Currency': z.array(z.string()).optional(),        // ["EUR"]
  'deadline-receipt-tender-date-lot': z.array(z.string()).optional(), // ["2026-02-05+01:00"]
  links: z.object({
    xml: z.record(z.string()).optional(),
    pdf: z.record(z.string()).optional(),
    html: z.record(z.string()).optional(),
  }).optional(),
});

export type RawNotice = z.infer<typeof RawNoticeSchema>;

export const TedSearchResponseSchema = z.object({
  notices: z.array(RawNoticeSchema),
  totalNoticeCount: z.number(),
  iterationNextToken: z.string().nullable(),  // always null in practice — use page-based loop
  timedOut: z.boolean(),
});

export type TedSearchResponse = z.infer<typeof TedSearchResponseSchema>;

/** Fields requested in every TED search — must include notice-type for application-level filter */
export const TED_FIELDS = [
  'ND',
  'PD',
  'TI',
  'PC',
  'CY',
  'notice-type',
  'buyer-name',
  'title-lot',
  'description-lot',
  'BT-27-Lot',
  'BT-27-Lot-Currency',
  'deadline-receipt-tender-date-lot',
  'links',
] as const;
