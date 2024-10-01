import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { telegramBotTable as telegramBot } from './schema';

const WOKRER_URL = 'https://ajou-notice.asitis.workers.dev';
interface Update {
	update_id: number;
	message?: Message;
}

interface Message {
	message_id: number;
	from: User;
	chat: Chat;
	text?: string;
	reply_to_message?: Message;
}

interface User {
	id: number;
	username: string;
}

interface Chat {
	id: number;
	username: string;
}

interface Notice {
	id: number;
	category: string;
	department: string;
	title: string;
	content: string;
	url: string;
	date: string;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const sendMessage = async (chatId: number, message: string, options?: { forceReply?: boolean }) => {
			const params = {
				chat_id: chatId,
				text: message,
				...(options?.forceReply && { reply_markup: { force_reply: true } }),
			};

			await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(params),
			});
		};

		const db = drizzle(env.DB);
		const { pathname } = new URL(request.url);

		if (pathname === '/api/webhook') {
			if (request.method === 'OPTIONS') {
				return new Response('', {
					headers: {
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Methods': 'POST',
						'Access-Control-Allow-Headers': 'Content-Type',
						'Access-Control-Max-Age': '86400',
					},
				});
			} else if (request.method === 'POST') {
				const { message }: Update = await request.json();

				if (message && message.reply_to_message) {
					const question = message.reply_to_message.text!.trim();
					const answer = message.text!.trim();

					if (question.startsWith('⚙️')) {
						const info = await db.select().from(telegramBot).where(eq(telegramBot.chatId, message.from.id)).get();
						if (!info) {
							await sendMessage(message.chat.id, '🚫 현재 공지사항 알림을 받지 않고 있습니다.');
						} else {
							const queryParams = new URLSearchParams(info.queryParams);
							if (question.includes('카테고리')) {
								queryParams.set('category', answer);
							} else if (question.includes('부서')) {
								queryParams.set('department', answer);
							} else if (question.includes('키워드')) {
								queryParams.set('search', answer);
							}

							try {
								await db.update(telegramBot).set({ queryParams: queryParams.toString() }).where(eq(telegramBot.chatId, message.from.id));
								await sendMessage(message.chat.id, '🔔 공지사항 알림 필터링 조건을 변경했습니다.');
							} catch (error) {
								await sendMessage(message.chat.id, '❗ 오류가 발생했습니다');
								return new Response('Internal Server Error', {
									status: 500,
								});
							}
						}
					}

					return new Response('OK', {
						status: 200,
					});
				} else if (message && message.text) {
					const command = message.text.trim();

					if (command.startsWith('/start')) {
						await sendMessage(
							message.chat.id,
							'👋 안녕하세요! 아주대학교 공지사항 알림봇입니다. 알림을 받고 싶으시다면 명령어를 확인해주세요.'
						);
					} else if (command.startsWith('/subscribe')) {
						const chatId = message.from.id;
						const notices: Notice[] = await env.NOTICE_WORKER.fetch(`${WOKRER_URL}/api/notices`, {
							method: 'GET',
						}).then((response) => response.json());

						const newRecord = {
							chatId,
							latestId: notices[0]?.id ?? 0,
							queryParams: '',
						};

						try {
							const info = await db.select().from(telegramBot).where(eq(telegramBot.chatId, chatId)).get();
							if (info) {
								await sendMessage(message.chat.id, '✅ 이미 알림을 받고 있습니다.');
							} else {
								await db.insert(telegramBot).values(newRecord);
								await sendMessage(message.chat.id, '🔔 공지사항 알림을 받습니다.');
							}
						} catch (error) {
							await sendMessage(message.chat.id, '❗ 오류가 발생했습니다');
							return new Response('Internal Server Error', {
								status: 500,
							});
						}
					} else if (command.startsWith('/unsubscribe')) {
						try {
							const result = await db.delete(telegramBot).where(eq(telegramBot.chatId, message.from.id));
							if (result.meta.rows_written === 0) {
								await sendMessage(message.chat.id, '🚫 현재 공지사항 알림을 받지 않고 있습니다.');
							} else {
								await sendMessage(message.chat.id, '🚫 더이상 공지사항 알림을 받지 않습니다.');
							}
						} catch (error) {
							return new Response('Internal Server Error', {
								status: 500,
							});
						}
					} else if (command.startsWith('/category')) {
						await sendMessage(message.chat.id, '⚙️ 카테고리 필터를 등록합니다. 알림을 받고 싶은 공지 분류를 입력해주세요.', {
							forceReply: true,
						});
					} else if (command.startsWith('/department')) {
						await sendMessage(message.chat.id, '⚙️ 공지부서 필터를 등록합니다. 알림을 받고 싶은 공지부서를 입력해주세요.', {
							forceReply: true,
						});
					} else if (command.startsWith('/keyword')) {
						await sendMessage(message.chat.id, '⚙️ 키워드 필터를 등록합니다. 알림을 받고 싶은 공지 키워드를 입력해주세요.', {
							forceReply: true,
						});
					}
				}

				return new Response('OK', {
					status: 200,
				});
			} else {
				return new Response('Method Not Allowed', {
					status: 405,
					headers: {
						Allow: 'POST',
					},
				});
			}
		}

		return new Response('404 Not Found', {
			status: 404,
		});
	},

	async scheduled(event, env, ctx) {
		const sendMessage = async (chatId: number, message: string) => {
			const params = {
				chat_id: chatId,
				text: message,
			};

			await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(params),
			});
		};

		const db = drizzle(env.DB);

		const bots = await db.select().from(telegramBot).all();

		for (const bot of bots) {
			const response = await env.NOTICE_WORKER.fetch(`${WOKRER_URL}/api/notices?${bot.queryParams}`, {
				method: 'GET',
			});
			const notices: Notice[] = await response.json();
			const latestId = notices[0]?.id ?? 0;

			if (latestId > bot.latestId) {
				await db.update(telegramBot).set({ latestId }).where(eq(telegramBot.chatId, bot.chatId));
			}

			const newNotices = notices.filter((notice) => notice.id > bot.latestId).reverse();

			for (const notice of newNotices) {
				await sendMessage(bot.chatId, `${notice.title}\n${notice.url}`);
			}
		}
	},
} satisfies ExportedHandler<Env>;
