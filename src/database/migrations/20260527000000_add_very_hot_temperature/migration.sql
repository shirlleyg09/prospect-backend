-- Migration: add VERY_HOT to LeadTemperature enum
-- PostgreSQL allows adding enum values without a full rebuild

ALTER TYPE "LeadTemperature" ADD VALUE IF NOT EXISTS 'VERY_HOT';
