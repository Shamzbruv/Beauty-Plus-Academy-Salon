FROM php:8.2-apache

# Enable Apache mod_rewrite
RUN a2enmod rewrite

# Copy the application code
COPY . /var/www/html/

# Increase upload limits for the PDF attachment
RUN echo "upload_max_filesize = 50M\npost_max_size = 50M" > /usr/local/etc/php/conf.d/uploads.ini

# Expose port 80 for Railway to route traffic to
EXPOSE 80
