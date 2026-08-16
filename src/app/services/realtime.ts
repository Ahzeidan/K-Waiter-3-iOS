import Pusher from 'pusher-js';
import { apiClient } from '@/app/services/api-client';
import type { RealtimeConfig } from '@/shared/domain';

export interface RealtimeEvent {
  type: string;
  aggregateId?: number | null;
  occurredAt?: string;
}

let client: Pusher | null = null;

function stop(): void {
  client?.disconnect();
  client = null;
}

function start(
  config: RealtimeConfig | null | undefined,
  onEvent: (event: RealtimeEvent) => void,
  onState: (connected: boolean) => void,
): boolean {
  stop();
  if (!config?.enabled || !config.key || !config.channel) {
    onState(false);
    return false;
  }

  const options: ConstructorParameters<typeof Pusher>[1] = {
    cluster: config.cluster || 'mt1',
    forceTLS: config.forceTLS,
    wsPort: config.wsPort,
    wssPort: config.wssPort,
    enabledTransports: config.forceTLS ? ['wss'] : ['ws'],
    channelAuthorization: {
      customHandler: (params, callback) => {
        void apiClient.post<{ auth: string; channel_data?: string }>(config.authEndpoint, {
          socket_id: params.socketId,
          channel_name: params.channelName,
        }).then(data => callback(null, data)).catch(reason => {
          callback(reason instanceof Error ? reason : new Error('Realtime authorization failed'), null);
        });
      },
    },
  };
  if (config.host) options.wsHost = config.host;

  client = new Pusher(config.key, options);
  client.connection.bind('connected', () => onState(true));
  client.connection.bind('disconnected', () => onState(false));
  client.connection.bind('unavailable', () => onState(false));
  const channel = client.subscribe(config.channel);
  channel.bind('kwaiter.updated', (event: RealtimeEvent) => onEvent(event));
  channel.bind('pusher:subscription_error', () => onState(false));
  return true;
}

export const realtimeClient = { start, stop };
