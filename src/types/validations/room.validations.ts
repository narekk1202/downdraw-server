import z from 'zod';

export const roomValidation = z.object({
	name: z.string().min(1).max(100),
	creatorId: z.uuid(),
});

export type RoomValidation = z.infer<typeof roomValidation>;
