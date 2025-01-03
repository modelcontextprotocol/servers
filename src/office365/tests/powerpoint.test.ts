import { PowerPointPresentationManagement } from '../src/functions/powerpoint/presentations';
import { PowerPointSlideManagement } from '../src/functions/powerpoint/slides';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredential } from '@azure/identity';

jest.mock('@microsoft/microsoft-graph-client');
jest.mock('@azure/identity');

describe('PowerPoint Management', () => {
  let presentationManager: PowerPointPresentationManagement;
  let slideManager: PowerPointSlideManagement;
  let mockClient: jest.Mocked<Client>;

  beforeEach(() => {
    mockClient = {
      api: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn()
    } as unknown as jest.Mocked<Client>;

    (Client.init as jest.Mock).mockReturnValue(mockClient);

    const mockCredential = {
      getToken: jest.fn().mockResolvedValue({ token: 'test-token' })
    };

    presentationManager = new PowerPointPresentationManagement(mockCredential as TokenCredential);
    slideManager = new PowerPointSlideManagement(mockCredential as TokenCredential);
  });

  describe('PresentationManagement', () => {
    it('should list presentations', async () => {
      const mockPresentations = {
        value: [
          {
            id: '1',
            name: 'test.pptx',
            createdDateTime: '2024-01-01',
            lastModifiedDateTime: '2024-01-02',
            webUrl: 'https://example.com'
          }
        ]
      };

      mockClient.get.mockResolvedValueOnce(mockPresentations);

      const result = await presentationManager.listPresentations();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test.pptx');
    });

    it('should create presentation from template', async () => {
      const mockPresentation = {
        id: '1',
        name: 'test.pptx',
        createdDateTime: '2024-01-01',
        lastModifiedDateTime: '2024-01-01',
        webUrl: 'https://example.com'
      };

      mockClient.post.mockResolvedValueOnce(mockPresentation);

      const result = await presentationManager.createPresentation({
        name: 'test.pptx',
        template: 'template-id'
      });

      expect(result.id).toBe('1');
      expect(mockClient.post).toHaveBeenCalledWith({
        name: 'test.pptx',
        parentReference: { id: undefined }
      });
    });
  });

  describe('SlideManagement', () => {
    it('should list slides', async () => {
      const mockSlides = {
        value: [
          { id: '1', title: 'Slide 1' },
          { id: '2', title: 'Slide 2' }
        ]
      };

      mockClient.get.mockResolvedValueOnce(mockSlides);

      const result = await slideManager.listSlides({ presentationId: '1' });
      expect(result).toHaveLength(2);
    });

    it('should add element to slide', async () => {
      await slideManager.addElement({
        presentationId: '1',
        slideId: '1',
        element: {
          type: 'text',
          content: 'Hello World',
          position: { x: 0, y: 0 },
          size: { width: 100, height: 50 }
        }
      });

      expect(mockClient.post).toHaveBeenCalledWith({
        type: 'Text',
        text: 'Hello World',
        x: 0,
        y: 0,
        width: 100,
        height: 50
      });
    });

    it('should reorder slides', async () => {
      await slideManager.reorderSlides({
        presentationId: '1',
        slideIds: ['2', '1', '3']
      });

      expect(mockClient.post).toHaveBeenCalledWith({
        ids: ['2', '1', '3']
      });
    });

    it('should export slide as image', async () => {
      const mockResponse = {
        value: 'base64-image-data'
      };

      mockClient.post.mockResolvedValueOnce(mockResponse);

      const result = await slideManager.exportSlide({
        presentationId: '1',
        slideId: '1'
      });

      expect(result).toBe('base64-image-data');
    });
  });
});