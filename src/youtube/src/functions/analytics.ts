import { MCPFunction, MCPFunctionGroup } from '@modelcontextprotocol/typescript-sdk';
import { google } from 'googleapis';

export class AnalyticsManagement implements MCPFunctionGroup {
  private youtube;

  constructor() {
    this.youtube = google.youtube({
      version: 'v3',
      auth: process.env.YOUTUBE_API_KEY
    });
  }

  @MCPFunction({
    description: 'Analyze channel growth trends',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string' },
        period: { type: 'string', enum: ['7days', '30days', '90days', '365days'] }
      },
      required: ['channelId']
    }
  })
  async analyzeChannelGrowth({ channelId, period = '30days' }: { 
    channelId: string;
    period?: string;
  }): Promise<any> {
    try {
      const analytics = await this.youtube.channelAnalytics.query({
        ids: 'channel==' + channelId,
        metrics: [
          'views',
          'estimatedMinutesWatched',
          'averageViewDuration',
          'subscribersGained',
          'subscribersLost',
          'likes',
          'comments'
        ].join(','),
        dimensions: 'day',
        startDate: this.getStartDate(period),
        endDate: 'today'
      });

      return this.processGrowthMetrics(analytics.data.rows || []);
    } catch (error) {
      throw new Error(`Failed to analyze channel growth: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Get video performance metrics',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string' }
      },
      required: ['videoId']
    }
  })
  async getVideoMetrics({ videoId }: { videoId: string }): Promise<any> {
    try {
      const [videoStats, analytics] = await Promise.all([
        this.youtube.videos.list({
          part: ['statistics'],
          id: [videoId]
        }),
        this.youtube.videoAnalytics.query({
          ids: 'video==' + videoId,
          metrics: [
            'views',
            'estimatedMinutesWatched',
            'averageViewDuration',
            'averageViewPercentage',
            'annotationClickThroughRate',
            'annotationCloseRate',
            'subscribersGained',
            'shares'
          ].join(','),
          dimensions: 'day'
        })
      ]);

      return {
        overall: videoStats.data.items[0].statistics,
        detailed: this.processVideoMetrics(analytics.data.rows || [])
      };
    } catch (error) {
      throw new Error(`Failed to get video metrics: ${error.message}`);
    }
  }

  @MCPFunction({
    description: 'Predict future video performance',
    parameters: {
      type: 'object',
      properties: {
        videoId: { type: 'string' }
      },
      required: ['videoId']
    }
  })
  async predictPerformance({ videoId }: { videoId: string }): Promise<any> {
    try {
      const [video, analytics] = await Promise.all([
        this.youtube.videos.list({
          part: ['snippet', 'statistics'],
          id: [videoId]
        }),
        this.getVideoMetrics({ videoId })
      ]);

      const predictions = this.generatePredictions(
        video.data.items[0],
        analytics
      );

      return {
        predictions,
        confidence: this.calculateConfidence(video.data.items[0]),
        factors: this.getInfluencingFactors(video.data.items[0])
      };
    } catch (error) {
      throw new Error(`Failed to predict performance: ${error.message}`);
    }
  }

  private getStartDate(period: string): string {
    const date = new Date();
    switch (period) {
      case '7days':
        date.setDate(date.getDate() - 7);
        break;
      case '30days':
        date.setDate(date.getDate() - 30);
        break;
      case '90days':
        date.setDate(date.getDate() - 90);
        break;
      case '365days':
        date.setDate(date.getDate() - 365);
        break;
    }
    return date.toISOString().split('T')[0];
  }

  private processGrowthMetrics(data: any[]): any {
    const metrics = {
      viewsGrowth: 0,
      subscriberGrowth: 0,
      engagementTrends: {
        likes: [],
        comments: [],
        shares: []
      },
      watchTimeAnalysis: {
        total: 0,
        average: 0,
        trend: 'stable'
      }
    };

    // Calculate growth rates and trends
    if (data.length > 1) {
      const firstDay = data[0];
      const lastDay = data[data.length - 1];

      metrics.viewsGrowth = ((lastDay.views - firstDay.views) / firstDay.views) * 100;
      metrics.subscriberGrowth = lastDay.subscribersGained - lastDay.subscribersLost;

      // Process engagement metrics
      data.forEach(day => {
        metrics.engagementTrends.likes.push(day.likes);
        metrics.engagementTrends.comments.push(day.comments);
        metrics.watchTimeAnalysis.total += day.estimatedMinutesWatched;
      });

      metrics.watchTimeAnalysis.average = metrics.watchTimeAnalysis.total / data.length;
      metrics.watchTimeAnalysis.trend = this.analyzeTrend(data.map(d => d.estimatedMinutesWatched));
    }

    return metrics;
  }

  private processVideoMetrics(data: any[]): any {
    return {
      viewsOverTime: data.map(d => ({
        date: d[0],
        views: d[1],
        watchTime: d[2]
      })),
      retentionRate: this.calculateRetention(data),
      peakEngagementPoints: this.findPeaks(data),
      audienceRetention: this.analyzeAudienceRetention(data)
    };
  }

  private analyzeTrend(values: number[]): string {
    if (values.length < 2) return 'insufficient_data';
    
    const gradient = values[values.length - 1] - values[0];
    const percentage = (gradient / values[0]) * 100;

    if (percentage > 10) return 'growing';
    if (percentage < -10) return 'declining';
    return 'stable';
  }

  private calculateRetention(data: any[]): number {
    if (!data.length) return 0;
    const totalViews = data.reduce((sum, day) => sum + day[1], 0);
    const completedViews = data.reduce((sum, day) => sum + (day[2] >= 0.9 ? day[1] : 0), 0);
    return (completedViews / totalViews) * 100;
  }

  private findPeaks(data: any[]): any[] {
    const peaks = [];
    const viewThreshold = Math.max(...data.map(d => d[1])) * 0.8;

    data.forEach((day, index) => {
      if (day[1] >= viewThreshold) {
        peaks.push({
          date: day[0],
          views: day[1],
          percentile: (day[1] / viewThreshold) * 100
        });
      }
    });

    return peaks;
  }

  private analyzeAudienceRetention(data: any[]): any {
    const segments = {
      start: 0,
      middle: 0,
      end: 0
    };

    data.forEach((day, index) => {
      const position = index / data.length;
      const retention = day[2] / day[1];  // watchTime / views

      if (position < 0.33) segments.start += retention;
      else if (position < 0.66) segments.middle += retention;
      else segments.end += retention;
    });

    const normalize = (val: number, count: number) => (val / count) * 100;
    const segmentSize = Math.floor(data.length / 3);

    return {
      startRetention: normalize(segments.start, segmentSize),
      middleRetention: normalize(segments.middle, segmentSize),
      endRetention: normalize(segments.end, segmentSize)
    };
  }

  private generatePredictions(video: any, analytics: any): any {
    const baseMetrics = video.statistics;
    const projectedViews = this.projectMetric(baseMetrics.viewCount, analytics.detailed.viewsOverTime);
    const projectedEngagement = this.projectEngagement(baseMetrics, analytics);

    return {
      views: {
        next7Days: projectedViews.week,
        next30Days: projectedViews.month,
        next90Days: projectedViews.quarter
      },
      engagement: {
        likes: projectedEngagement.likes,
        comments: projectedEngagement.comments,
        shares: projectedEngagement.shares
      },
      milestones: this.predictMilestones(baseMetrics, projectedViews)
    };
  }

  private projectMetric(current: number, history: any[]): any {
    const growth = history.reduce((acc, day, i) => {
      if (i === 0) return acc;
      return acc + ((day.views - history[i-1].views) / history[i-1].views);
    }, 0) / (history.length - 1);

    return {
      week: current * Math.pow(1 + growth, 7),
      month: current * Math.pow(1 + growth, 30),
      quarter: current * Math.pow(1 + growth, 90)
    };
  }

  private projectEngagement(current: any, analytics: any): any {
    const engagementRates = {
      likes: current.likeCount / current.viewCount,
      comments: current.commentCount / current.viewCount,
      shares: analytics.detailed.peakEngagementPoints.length / current.viewCount
    };

    const projected = this.projectMetric(current.viewCount, analytics.detailed.viewsOverTime);

    return {
      likes: projected.month * engagementRates.likes,
      comments: projected.month * engagementRates.comments,
      shares: projected.month * engagementRates.shares
    };
  }

  private predictMilestones(current: any, projected: any): any[] {
    const milestones = [];
    const metrics = ['viewCount', 'likeCount', 'commentCount'];
    
    metrics.forEach(metric => {
      const value = parseInt(current[metric]);
      const nextMilestone = Math.pow(10, Math.floor(Math.log10(value)) + 1);
      
      if (nextMilestone > value) {
        const daysToMilestone = this.calculateDaysToMilestone(
          value,
          nextMilestone,
          projected
        );

        milestones.push({
          metric,
          current: value,
          next: nextMilestone,
          estimatedDays: daysToMilestone
        });
      }
    });

    return milestones;
  }

  private calculateDaysToMilestone(current: number, target: number, projected: any): number {
    const dailyGrowth = (projected.month - current) / 30;
    return Math.ceil((target - current) / dailyGrowth);
  }

  private calculateConfidence(video: any): number {
    // Factors affecting prediction confidence
    const factors = {
      age: this.getAgeFactor(video.snippet.publishedAt),
      consistency: this.getConsistencyFactor(video.statistics),
      dataPoints: this.getDataPointsFactor(video.statistics),
      category: this.getCategoryFactor(video.snippet.categoryId)
    };

    return Object.values(factors).reduce((sum, val) => sum + val, 0) / Object.keys(factors).length;
  }

  private getInfluencingFactors(video: any): string[] {
    const factors = [];
    const stats = video.statistics;
    const snippet = video.snippet;

    if (parseInt(stats.viewCount) > 10000) {
      factors.push('High view count indicates strong initial performance');
    }

    if (parseInt(stats.likeCount) / parseInt(stats.viewCount) > 0.1) {
      factors.push('Above average engagement rate');
    }

    if (snippet.tags && snippet.tags.length > 10) {
      factors.push('Well-optimized tags');
    }

    return factors;
  }

  private getAgeFactor(publishedAt: string): number {
    const age = Date.now() - new Date(publishedAt).getTime();
    const days = age / (1000 * 60 * 60 * 24);
    return Math.min(1, days / 30);  // Higher confidence with more historical data
  }

  private getConsistencyFactor(stats: any): number {
    const engagementRate = parseInt(stats.likeCount) / parseInt(stats.viewCount);
    return engagementRate > 0.05 ? 1 : engagementRate * 20;
  }

  private getDataPointsFactor(stats: any): number {
    const points = Object.values(stats).filter(val => parseInt(val) > 0).length;
    return points / Object.keys(stats).length;
  }

  private getCategoryFactor(categoryId: string): number {
    // Categories with more predictable performance patterns
    const predictableCategories = ['10', '20', '27', '28'];  // Music, Gaming, Education, Science
    return predictableCategories.includes(categoryId) ? 1 : 0.8;
  }
}