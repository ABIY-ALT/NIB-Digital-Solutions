'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchIdeas, voteForIdea } from '../client';
import type { IdeaSort, IdeaStatus, PublicIdea } from '../types';

export interface IdeaQuery {
  sort: IdeaSort;
  status?: IdeaStatus;
  q?: string;
  limit?: number;
}

const KEY = ['marketplace', 'ideas'] as const;

/** Approved ideas on the public board (with this visitor's votes marked). */
export function useIdeas(query: IdeaQuery) {
  return useQuery({
    queryKey: [...KEY, query],
    queryFn: ({ signal }) => fetchIdeas(query, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: 1,
  });
}

/** Votes for an idea and updates it in every cached list (counts come from the server). */
export function useVoteIdea() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reference: string) => voteForIdea(reference),
    onSuccess: (updated: PublicIdea) => {
      client.setQueriesData<PublicIdea[]>({ queryKey: KEY }, (list) =>
        list?.map((i) => (i.reference === updated.reference ? updated : i)),
      );
    },
  });
}
