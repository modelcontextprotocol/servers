-- ============================================================================
-- MySQL DDL Script for HR Schema
-- Generated from partial PostgreSQL/Oracle HR Schema
-- Date: 2025-12-12
-- ============================================================================

-- Create database if it doesn't exist and use it
CREATE DATABASE IF NOT EXISTS hr;
USE hr;

-- Disable foreign key checks for dropping tables
SET FOREIGN_KEY_CHECKS = 0;

-- Drop tables if they exist
DROP TABLE IF EXISTS job_history;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS countries;
DROP TABLE IF EXISTS regions;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- Table: REGIONS
-- Description: Stores region information (e.g., Americas, Europe, Asia)
-- ============================================================================
CREATE TABLE regions (
    region_id       INT NOT NULL,
    region_name     VARCHAR(25),
    CONSTRAINT reg_id_pk PRIMARY KEY (region_id)
) COMMENT='Regions table that contains region numbers and names';

-- ============================================================================
-- Table: COUNTRIES
-- Description: Stores country information with region association
-- ============================================================================
CREATE TABLE countries (
    country_id      CHAR(2) NOT NULL,
    country_name    VARCHAR(60),
    region_id       INT,
    CONSTRAINT country_c_id_pk PRIMARY KEY (country_id),
    CONSTRAINT countr_reg_fk FOREIGN KEY (region_id) 
        REFERENCES regions(region_id)
) COMMENT='Country table with country ID and associated region ID';

-- ============================================================================
-- Table: LOCATIONS
-- Description: Stores physical location information for offices
-- ============================================================================
CREATE TABLE locations (
    location_id     INT NOT NULL,
    street_address  VARCHAR(40),
    postal_code     VARCHAR(12),
    city            VARCHAR(30) NOT NULL,
    state_province  VARCHAR(25),
    country_id      CHAR(2),
    CONSTRAINT loc_id_pk PRIMARY KEY (location_id),
    CONSTRAINT loc_c_id_fk FOREIGN KEY (country_id) 
        REFERENCES countries(country_id)
) COMMENT='Locations table with addresses of company offices';

-- ============================================================================
-- Table: JOBS
-- Description: Stores job titles and salary ranges
-- ============================================================================
CREATE TABLE jobs (
    job_id          VARCHAR(10) NOT NULL,
    job_title       VARCHAR(35) NOT NULL,
    min_salary      INT,
    max_salary      INT,
    CONSTRAINT job_id_pk PRIMARY KEY (job_id)
) COMMENT='Jobs table with job titles and salary ranges';

-- ============================================================================
-- Table: DEPARTMENTS
-- Description: Stores department information
-- Note: MANAGER_ID FK is added after EMPLOYEES table is created
-- ============================================================================
CREATE TABLE departments (
    department_id   INT NOT NULL COMMENT 'Primary key of departments table',
    department_name VARCHAR(30) NOT NULL,
    manager_id      INT COMMENT 'Manager ID of a department. Foreign key to employee_id',
    location_id     INT,
    CONSTRAINT dept_id_pk PRIMARY KEY (department_id),
    CONSTRAINT dept_loc_fk FOREIGN KEY (location_id) 
        REFERENCES locations(location_id)
) COMMENT='Departments table showing department details';

-- ============================================================================
-- Table: EMPLOYEES
-- Description: Stores employee information
-- ============================================================================
CREATE TABLE employees (
    employee_id     INT NOT NULL COMMENT 'Primary key of employees table',
    first_name      VARCHAR(20),
    last_name       VARCHAR(25) NOT NULL,
    email           VARCHAR(25) NOT NULL COMMENT 'Email address - must be unique',
    phone_number    VARCHAR(20),
    hire_date       DATE NOT NULL,
    job_id          VARCHAR(10) NOT NULL,
    salary          DECIMAL(8,2) COMMENT 'Monthly salary - must be greater than zero',
    commission_pct  DECIMAL(2,2) COMMENT 'Commission percentage (0.00 to 0.99)',
    manager_id      INT,
    department_id   INT,
    CONSTRAINT emp_emp_id_pk PRIMARY KEY (employee_id),
    CONSTRAINT emp_email_uk UNIQUE (email),
    CONSTRAINT emp_salary_min CHECK (salary > 0),
    CONSTRAINT emp_dept_fk FOREIGN KEY (department_id) 
        REFERENCES departments(department_id),
    CONSTRAINT emp_job_fk FOREIGN KEY (job_id) 
        REFERENCES jobs(job_id),
    CONSTRAINT emp_manager_fk FOREIGN KEY (manager_id) 
        REFERENCES employees(employee_id)
) COMMENT='Employees table containing employee details';

-- ============================================================================
-- Add MANAGER_ID foreign key to DEPARTMENTS table
-- (Circular reference with EMPLOYEES table)
-- ============================================================================
ALTER TABLE departments 
    ADD CONSTRAINT dept_mgr_fk FOREIGN KEY (manager_id) 
    REFERENCES employees(employee_id);

-- ============================================================================
-- Table: JOB_HISTORY
-- Description: Stores employee job history
-- ============================================================================
CREATE TABLE job_history (
    employee_id     INT NOT NULL COMMENT 'Foreign key to employee_id in employees table',
    start_date      DATE NOT NULL COMMENT 'Start date of the job - part of composite primary key',
    end_date        DATE NOT NULL COMMENT 'End date of the job - must be greater than start_date',
    job_id          VARCHAR(10) NOT NULL,
    department_id   INT,
    CONSTRAINT jhist_emp_id_st_date_pk PRIMARY KEY (employee_id, start_date),
    CONSTRAINT jhist_date_interval CHECK (end_date > start_date),
    CONSTRAINT jhist_emp_fk FOREIGN KEY (employee_id) 
        REFERENCES employees(employee_id),
    CONSTRAINT jhist_job_fk FOREIGN KEY (job_id) 
        REFERENCES jobs(job_id),
    CONSTRAINT jhist_dept_fk FOREIGN KEY (department_id) 
        REFERENCES departments(department_id)
) COMMENT='Job history table tracking employee job changes';

-- ============================================================================
-- Create indexes for better query performance
-- ============================================================================
CREATE INDEX emp_department_ix ON employees(department_id);
CREATE INDEX emp_job_ix ON employees(job_id);
CREATE INDEX emp_manager_ix ON employees(manager_id);
CREATE INDEX emp_name_ix ON employees(last_name, first_name);
CREATE INDEX dept_location_ix ON departments(location_id);
CREATE INDEX jhist_job_ix ON job_history(job_id);
CREATE INDEX jhist_employee_ix ON job_history(employee_id);
CREATE INDEX jhist_department_ix ON job_history(department_id);
CREATE INDEX loc_city_ix ON locations(city);
CREATE INDEX loc_state_province_ix ON locations(state_province);
CREATE INDEX loc_country_ix ON locations(country_id);

-- ============================================================================
-- End of script
-- ============================================================================
