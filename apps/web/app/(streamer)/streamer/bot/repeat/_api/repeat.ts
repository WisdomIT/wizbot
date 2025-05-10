'use server';

import { trpc } from '@/src/utils/trpc';

import { getCurrentUser } from '../../../../../login/_apis/user';
import { Repeat } from '../_components/columns';

export async function fetchRepeatList() {
  const currentUser = await getCurrentUser();

  if (currentUser.role !== 'streamer') {
    throw new Error('Unauthorized');
  }

  const repeatList = await trpc.command.getRepeatList.query({
    userId: currentUser.id,
  });

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

  const findSetting = await trpc.user.getUserSetting.query({
    userId: currentUser.id,
  });

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
    userId: currentUser.id,
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
      userId: currentUser.id,
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
      userId: currentUser.id,
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
      userId: currentUser.id,
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
    await trpc.user.updateUserSettiong.mutate({
      userId: currentUser.id,
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
