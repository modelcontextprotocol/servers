-- ============================================================================
-- PostgreSQL DDL Script for HR Schema
-- Generated from Oracle HR Schema
-- Date: 2025-12-11
-- ============================================================================

-- ============================================================================
-- Schema: HR
-- Description: Create HR schema and switch to it
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS hr;
SET search_path TO hr;

-- Drop tables if they exist (in reverse order of dependencies)
DROP TABLE IF EXISTS job_history CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS countries CASCADE;
DROP TABLE IF EXISTS regions CASCADE;

-- ============================================================================
-- Table: REGIONS
-- Description: Stores region information (e.g., Americas, Europe, Asia)
-- ============================================================================
CREATE TABLE regions (
    region_id       INTEGER NOT NULL,
    region_name     VARCHAR(25),
    CONSTRAINT reg_id_pk PRIMARY KEY (region_id)
);

-- ============================================================================
-- Table: COUNTRIES
-- Description: Stores country information with region association
-- ============================================================================
CREATE TABLE countries (
    country_id      CHAR(2) NOT NULL,
    country_name    VARCHAR(60),
    region_id       INTEGER,
    CONSTRAINT country_c_id_pk PRIMARY KEY (country_id),
    CONSTRAINT countr_reg_fk FOREIGN KEY (region_id) 
        REFERENCES regions(region_id)
);

-- ============================================================================
-- Table: LOCATIONS
-- Description: Stores physical location information for offices
-- ============================================================================
CREATE TABLE locations (
    location_id     INTEGER NOT NULL,
    street_address  VARCHAR(40),
    postal_code     VARCHAR(12),
    city            VARCHAR(30) NOT NULL,
    state_province  VARCHAR(25),
    country_id      CHAR(2),
    CONSTRAINT loc_id_pk PRIMARY KEY (location_id),
    CONSTRAINT loc_c_id_fk FOREIGN KEY (country_id) 
        REFERENCES countries(country_id)
);

-- ============================================================================
-- Table: JOBS
-- Description: Stores job titles and salary ranges
-- ============================================================================
CREATE TABLE jobs (
    job_id          VARCHAR(10) NOT NULL,
    job_title       VARCHAR(35) NOT NULL,
    min_salary      INTEGER,
    max_salary      INTEGER,
    CONSTRAINT job_id_pk PRIMARY KEY (job_id)
);

-- ============================================================================
-- Table: DEPARTMENTS
-- Description: Stores department information
-- Note: MANAGER_ID FK is added after EMPLOYEES table is created
-- ============================================================================
CREATE TABLE departments (
    department_id   INTEGER NOT NULL,
    department_name VARCHAR(30) NOT NULL,
    manager_id      INTEGER,
    location_id     INTEGER,
    CONSTRAINT dept_id_pk PRIMARY KEY (department_id),
    CONSTRAINT dept_loc_fk FOREIGN KEY (location_id) 
        REFERENCES locations(location_id)
);

-- ============================================================================
-- Table: EMPLOYEES
-- Description: Stores employee information
-- ============================================================================
CREATE TABLE employees (
    employee_id     INTEGER NOT NULL,
    first_name      VARCHAR(20),
    last_name       VARCHAR(25) NOT NULL,
    email           VARCHAR(25) NOT NULL,
    phone_number    VARCHAR(20),
    hire_date       DATE NOT NULL,
    job_id          VARCHAR(10) NOT NULL,
    salary          NUMERIC(8,2),
    commission_pct  NUMERIC(2,2),
    manager_id      INTEGER,
    department_id   INTEGER,
    CONSTRAINT emp_emp_id_pk PRIMARY KEY (employee_id),
    CONSTRAINT emp_email_uk UNIQUE (email),
    CONSTRAINT emp_salary_min CHECK (salary > 0),
    CONSTRAINT emp_dept_fk FOREIGN KEY (department_id) 
        REFERENCES departments(department_id),
    CONSTRAINT emp_job_fk FOREIGN KEY (job_id) 
        REFERENCES jobs(job_id),
    CONSTRAINT emp_manager_fk FOREIGN KEY (manager_id) 
        REFERENCES employees(employee_id)
);

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
    employee_id     INTEGER NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    job_id          VARCHAR(10) NOT NULL,
    department_id   INTEGER,
    CONSTRAINT jhist_emp_id_st_date_pk PRIMARY KEY (employee_id, start_date),
    CONSTRAINT jhist_date_interval CHECK (end_date > start_date),
    CONSTRAINT jhist_emp_fk FOREIGN KEY (employee_id) 
        REFERENCES employees(employee_id),
    CONSTRAINT jhist_job_fk FOREIGN KEY (job_id) 
        REFERENCES jobs(job_id),
    CONSTRAINT jhist_dept_fk FOREIGN KEY (department_id) 
        REFERENCES departments(department_id)
);

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
-- Comments on tables
-- ============================================================================
COMMENT ON TABLE regions IS 'Regions table that contains region numbers and names';
COMMENT ON TABLE countries IS 'Country table with country ID and associated region ID';
COMMENT ON TABLE locations IS 'Locations table with addresses of company offices';
COMMENT ON TABLE departments IS 'Departments table showing department details';
COMMENT ON TABLE jobs IS 'Jobs table with job titles and salary ranges';
COMMENT ON TABLE employees IS 'Employees table containing employee details';
COMMENT ON TABLE job_history IS 'Job history table tracking employee job changes';

-- ============================================================================
-- Comments on columns
-- ============================================================================
COMMENT ON COLUMN employees.employee_id IS 'Primary key of employees table';
COMMENT ON COLUMN employees.email IS 'Email address - must be unique';
COMMENT ON COLUMN employees.salary IS 'Monthly salary - must be greater than zero';
COMMENT ON COLUMN employees.commission_pct IS 'Commission percentage (0.00 to 0.99)';
COMMENT ON COLUMN departments.department_id IS 'Primary key of departments table';
COMMENT ON COLUMN departments.manager_id IS 'Manager ID of a department. Foreign key to employee_id';
COMMENT ON COLUMN job_history.employee_id IS 'Foreign key to employee_id in employees table';
COMMENT ON COLUMN job_history.start_date IS 'Start date of the job - part of composite primary key';
COMMENT ON COLUMN job_history.end_date IS 'End date of the job - must be greater than start_date';

-- ============================================================================
-- End of script
-- ============================================================================
