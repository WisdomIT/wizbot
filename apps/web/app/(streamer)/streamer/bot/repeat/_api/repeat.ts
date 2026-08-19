'use server';

import { trpc } from '@/src/utils/trpc';

import { getCurrentUser } from '../../../../../login/_apis/user';
import { Repeat } from '../_components/columns';

export async function fetchRepeatList() {
  const currentUser = await getCurrentUser();

  if (currentUser.role !== 'streamer') {
    throw new Error('Unauthorized');
  }

  const repeatList = await trpc.command.getRepeatList.query();

  const functionList = repeatList.map((item) => ({
    id: item.id,
    response: item.response,
    interval: item.interval,
  })) as Repeat[];

  return functionList;
}

export async function fetchUserDefaultInterval() {
  const currentUser = await getCurrentUser();

  if (currentUser.role !== 'streamer') {
    throw new Error('Unauthorized');
  }

  const findSetting = await trpc.user.getUserSetting.query();

  if (!findSetting) {
    throw new Error('Command not found');
  }

  return findSetting.chatbotDefaultRepeat;
}

export async function fetchRepeatById(id: number) {
  const currentUser = await getCurrentUser();

  if (currentUser.role !== 'streamer') {
    throw new Error('Unauthorized');
  }

  const findRepeat = await trpc.command.getRepeatById.query({
    id,
  });

  if (!findRepeat) {
    throw new Error('Command not found');
  }

  return {
    id: findRepeat.id,
    response: findRepeat.response,
    interval: findRepeat.interval,
  } as Repeat;
}

export async function createRepeat({ response, interval }: { response: string; interval: number }) {
  const currentUser = await getCurrentUser();

  if (currentUser.role !== 'streamer') {
    throw new Error('Unauthorized');
  }

  try {
    await trpc.command.createRepeat.mutate({
      response,
      interval,
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
  }
}

export async function deleteRepeat(id: number) {
  const currentUser = await getCurrentUser();

  if (currentUser.role !== 'streamer') {
    throw new Error('Unauthorized');
  }

  try {
    await trpc.command.deleteRepeat.mutate({
      id,
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
  }
}

export async function updateRepeat({
  id,
  response,
  interval,
}: {
  id: number;
  response: string;
  interval: number;
}) {
  const currentUser = await getCurrentUser();

  if (currentUser.role !== 'streamer') {
    throw new Error('Unauthorized');
  }

  try {
    await trpc.command.updateRepeat.mutate({
      id,
      response,
      interval,
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
  }
}

export async function updateInterval(interval: number) {
  const currentUser = await getCurrentUser();

  if (currentUser.role !== 'streamer') {
    throw new Error('Unauthorized');
  }

  try {
    await trpc.user.updateUserSetting.mutate({
      setting: {
        chatbotDefaultRepeat: interval,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
  }
}
