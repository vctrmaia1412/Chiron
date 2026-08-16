'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LogOut, Monitor } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, relativeTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Card, CardHeader, EmptyState, ListSkeleton, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';

interface SessionEntry {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current?: boolean;
}

export default function SessionsPage() {
  const queryClient = useQueryClient();
  const { context } = useSession();

  const { data, isLoading } = useQuery({
    queryKey: ['my-sessions'],
    queryFn: () => api.get<{ items: SessionEntry[] }>('/me/sessions'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/me/sessions/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
      toast.success('Acesso encerrado.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/configuracoes" className="hover:text-[var(--brand)]">
            Configurações
          </Link>
        }
        title="Meus acessos"
        description="Sessões abertas com a sua conta. Encerre qualquer uma que você não reconheça."
      />

      <Card>
        <CardHeader title={context?.user.email ?? 'Sessões'} />
        {isLoading ? (
          <ListSkeleton rows={3} />
        ) : items.length === 0 ? (
          <EmptyState title="Nenhuma sessão ativa" />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {items.map((session) => (
              <li key={session.id} className="flex items-center gap-3 px-4 py-3">
                <Monitor className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-[var(--ink)]">
                    {describeUserAgent(session.userAgent)}
                    {session.ip ? ` · ${session.ip}` : ''}
                  </p>
                  <p className="text-[12.5px] text-[var(--ink-3)]">
                    Última atividade {relativeTime(session.lastSeenAt)} · expira em{' '}
                    {formatDateTime(session.expiresAt)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => revoke.mutate(session.id)}>
                  <LogOut className="h-3.5 w-3.5" />
                  Encerrar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return 'Dispositivo não identificado';
  if (/iPhone|iPad/i.test(userAgent)) return 'iPhone ou iPad';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Macintosh/i.test(userAgent)) return 'Mac';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return 'Navegador';
}
