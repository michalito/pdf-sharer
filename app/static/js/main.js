document.addEventListener('DOMContentLoaded', () => {
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('file-input');
    const uploadArea = document.getElementById('upload-area');
    const themeToggle = document.getElementById('theme-toggle');
    const pdfLists = document.querySelectorAll('.pdf-list');

    const pdfColumns = document.querySelectorAll('.pdf-column');
    pdfColumns.forEach(column => {
        column.addEventListener('dragover', dragOver);
        column.addEventListener('dragleave', dragLeave);
        column.addEventListener('drop', drop);
    });


    // Theme toggle
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const icon = themeToggle.querySelector('i');
        icon.classList.toggle('fa-moon');
        icon.classList.toggle('fa-sun');
    });

    // File upload handling
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);

    // Drag and drop for file upload
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        handleFileUpload({ target: { files: e.dataTransfer.files } });
    });

    // PDF list drag and drop
    pdfLists.forEach(list => {
        list.addEventListener('dragstart', dragStart);
        list.addEventListener('dragover', dragOver);
        list.addEventListener('drop', drop);
    });

    // Event delegation for action buttons
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('download-btn')) {
            downloadPDF(e.target.dataset.id);
        } else if (e.target.classList.contains('process-btn')) {
            processPDF(e.target.dataset.id);
        } else if (e.target.classList.contains('delete-btn')) {
            deletePDF(e.target.dataset.id);
        }
    });

    function handleFileUpload(e) {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            if (file.type === 'application/pdf') {
                uploadPDF(file);
            } else {
                showFlashMessage('Only PDF files are allowed', 'error');
            }
        });
    }

    function uploadPDF(file) {
        const formData = new FormData();
        formData.append('file', file);

        fetch('/api/pdfs', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            showFlashMessage(`${data.filename} uploaded successfully`, 'success');
            updatePDFList();
        })
        .catch(error => {
            showFlashMessage('Error uploading file', 'error');
            console.error('Error:', error);
        });
    }

    function updatePDFList() {
        fetch('/api/pdfs')
        .then(response => response.json())
        .then(data => {
            const unprocessedList = document.getElementById('unprocessed-list');
            const processedList = document.getElementById('processed-list');
            
            unprocessedList.innerHTML = '';
            processedList.innerHTML = '';

            data.forEach(pdf => {
                const pdfItem = createPDFItem(pdf);
                if (pdf.status === 'Unprocessed') {
                    unprocessedList.appendChild(pdfItem);
                } else {
                    processedList.appendChild(pdfItem);
                }
            });
        })
        .catch(error => console.error('Error:', error));
    }

    function createPDFItem(pdf) {
        const item = document.createElement('div');
        item.className = 'pdf-item';
        item.dataset.id = pdf.id;
        item.draggable = true;
        item.addEventListener('dragstart', dragStart);
        item.addEventListener('dragend', dragEnd);

        item.innerHTML = `
            <div class="pdf-info">
                <span class="pdf-name">${pdf.filename}</span>
                <span class="pdf-date">${new Date(pdf.upload_date).toLocaleDateString()}</span>
            </div>
            <div class="pdf-actions">
                <button class="action-btn download-btn" data-id="${pdf.id}">
                    <i class="fas fa-download"></i> Download
                </button>
                ${pdf.status === 'Unprocessed' ? 
                    `<button class="action-btn process-btn" data-id="${pdf.id}">
                        <i class="fas fa-cog"></i> Process
                    </button>` :
                    `<button class="action-btn delete-btn" data-id="${pdf.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>`
                }
            </div>
        `;

        return item;
    }

    function downloadPDF(id) {
        window.location.href = `/api/pdfs/${id}`;
    }

    function processPDF(id) {
        fetch(`/api/pdfs/${id}/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'Processed' }),
        })
        .then(response => response.json())
        .then(data => {
            showFlashMessage(`${data.filename} processed successfully`, 'success');
            updatePDFList();
        })
        .catch(error => {
            showFlashMessage('Error processing PDF', 'error');
            console.error('Error:', error);
        });
    }

    function deletePDF(id) {
        if (confirm('Are you sure you want to delete this PDF?')) {
            fetch(`/api/pdfs/${id}`, {
                method: 'DELETE',
            })
            .then(response => {
                if (response.ok) {
                    showFlashMessage('PDF deleted successfully', 'success');
                    updatePDFList();
                } else {
                    throw new Error('Failed to delete PDF');
                }
            })
            .catch(error => {
                showFlashMessage('Error deleting PDF', 'error');
                console.error('Error:', error);
            });
        }
    }

    function dragStart(e) {
        e.dataTransfer.setData('text/plain', e.target.dataset.id);
        e.target.classList.add('dragging');
        
        // Create and set drag image
        const dragImage = e.target.cloneNode(true);
        dragImage.style.opacity = '0.5';
        dragImage.style.position = 'absolute';
        dragImage.style.top = '-1000px';
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(dragImage, 0, 0);
        
        setTimeout(() => document.body.removeChild(dragImage), 0);
    }

    function dragEnd(e) {
        e.target.classList.remove('dragging');
    }

    function dragLeave(e) {
        const dropzone = e.target.closest('.pdf-column');
        if (dropzone) {
            dropzone.classList.remove('drag-over');
        }
    }
    

    function dragOver(e) {
        e.preventDefault();
        const dropzone = e.target.closest('.pdf-column');
        if (dropzone) {
            dropzone.classList.add('drag-over');
        }
    }

    function drop(e) {
        e.preventDefault();
        const dropzone = e.target.closest('.pdf-column');
        if (dropzone) {
            dropzone.classList.remove('drag-over');
        }
        
        const id = e.dataTransfer.getData('text');
        const draggedElement = document.querySelector(`[data-id="${id}"]`);
        const newStatus = dropzone.id === 'unprocessed-pdfs' ? 'Unprocessed' : 'Processed';
        
        if (dropzone && draggedElement) {
            dropzone.querySelector('.pdf-list').appendChild(draggedElement);
            updatePDFStatus(id, newStatus);
        }
    }

    function updatePDFStatus(id, status) {
        fetch(`/api/pdfs/${id}/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: status }),
        })
        .then(response => response.json())
        .then(data => {
            showFlashMessage(`${data.filename} status updated to ${status}`, 'success');
            updatePDFList();
        })
        .catch(error => {
            showFlashMessage('Error updating PDF status', 'error');
            console.error('Error:', error);
        });
    }

    function showFlashMessage(message, type) {
        const flashContainer = document.getElementById('flash-messages');
        const flashMessage = document.createElement('div');
        flashMessage.className = `flash-message flash-${type}`;
        flashMessage.textContent = message;
        flashContainer.appendChild(flashMessage);
        setTimeout(() => {
            flashMessage.remove();
        }, 3000);
    }

    // Initial PDF list update
    updatePDFList();
});