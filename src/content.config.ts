import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const writing = defineCollection({
  loader: glob({ base: './src/content/writing', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    readTime: z.number().optional(),
    tags: z.array(z.string()).default([]),
    series: z.string().optional(),
  }),
});

export const collections = { writing };
