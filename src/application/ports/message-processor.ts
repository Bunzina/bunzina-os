export interface MessageProcessor<TMessage> {
  process(message: TMessage): Promise<boolean>;
}
