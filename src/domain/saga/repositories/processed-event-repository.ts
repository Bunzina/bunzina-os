export interface ProcessedEventRepository {
  tryMarkProcessed(eventId: string, consumer: string): Promise<boolean>;
}
